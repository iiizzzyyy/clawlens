# ClawLens Architecture

This document explains how ClawLens works under the hood, from plugin registration to span storage to UI rendering.

---

## Design Principles

ClawLens follows five core principles:

1. **Plugin-native** — Runs inside OpenClaw Gateway as a plugin, not a sidecar
2. **Zero-config ingestion** — Installing the plugin automatically hooks into the agent loop
3. **Single-process** — No Docker, no orchestration, no inter-process communication
4. **OTEL-compatible** — Consumes OTEL spans when available, but doesn't require OTEL
5. **Offline-first** — All data stays local in SQLite

---

## System Architecture

```
┌──────────────────────────────────────────────────────┐
│                   OpenClaw Gateway                    │
│                                                      │
│  ┌─────────┐   ┌──────────┐   ┌──────────────────┐  │
│  │ Channel  │──▶│  Agent   │──▶│  Tool Execution  │  │
│  │ Adapters │   │  Runtime  │   │  (bash, browser, │  │
│  └─────────┘   └────┬─────┘   │   webhooks, etc) │  │
│                     │          └──────────────────┘  │
│              ┌──────┴───────┐                        │
│              │  Lifecycle   │                        │
│              │   Hooks      │                        │
│              └──────┬───────┘                        │
│                     │                                │
│  ┌──────────────────▼─────────────────────────────┐  │
│  │              ClawLens Plugin                    │  │
│  │                                                │  │
│  │  ┌─────────────┐  ┌──────────┐  ┌──────────┐  │  │
│  │  │  Event       │  │  Query   │  │   Web    │  │  │
│  │  │  Capture     │──▶│  Engine  │──▶│   UI    │  │  │
│  │  │  (hooks)     │  │  (API)   │  │  (SPA)  │  │  │
│  │  └──────┬──────┘  └──────────┘  └──────────┘  │  │
│  │         │                                      │  │
│  │  ┌──────▼──────┐  ┌──────────┐                 │  │
│  │  │  SQLite     │  │  JSONL   │                 │  │
│  │  │  (spans)    │  │  Import  │                 │  │
│  │  └─────────────┘  └──────────┘                 │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

---

## Data Flow

### Live Capture (Real-Time)

```
1. OpenClaw fires lifecycle hook (e.g., message_received)
   ↓
2. ClawLens hook handler captures event context
   ↓
3. Event normalized into a span structure
   ↓
4. Span written to SQLite (WAL mode for concurrent reads)
   ↓
5. Web UI polls or uses SSE for live updates
```

### Historical Backfill

```
1. User starts OpenClaw with ClawLens plugin
   ↓
2. Plugin checks backfill_on_start config
   ↓
3. JSONL importer scans ~/.openclaw/agents/*/sessions/
   ↓
4. Each JSONL file parsed into spans
   ↓
5. Spans written to SQLite with source='jsonl'
   ↓
6. Import tracked in imports table to avoid re-processing
```

---

## Core Components

### 1. Event Capture (Hooks)

ClawLens registers lifecycle hooks to capture events as they happen.

**Implementation**: `packages/plugin/src/index.ts`

The plugin registers hooks for:
- **Session lifecycle**: `session_start`, `session_end`
- **Message flow**: `message_received`, `message_sent`
- **Model inference**: `before_model_resolve`, `after_model_call`
- **Tool execution**: `before_tool_exec`, `after_tool_exec`
- **Memory operations**: `memory_search`
- **Agent delegation**: `agent_delegate`

Each hook handler:
1. Extracts relevant context from the hook event
2. Creates or updates a span
3. Writes span to SQLite via `SpanWriter`

### 2. Storage Layer (SQLite)

**Schema**: `packages/plugin/src/db/schema.ts`

ClawLens uses a simple schema centered on the `spans` table:

```sql
CREATE TABLE spans (
  id            TEXT PRIMARY KEY,
  trace_id      TEXT NOT NULL,
  parent_id     TEXT,
  session_id    TEXT NOT NULL,
  agent_id      TEXT NOT NULL,
  channel       TEXT,
  span_type     TEXT NOT NULL,  -- session|turn|llm_call|tool_exec|...
  name          TEXT NOT NULL,
  start_ts      INTEGER NOT NULL,
  end_ts        INTEGER,
  duration_ms   INTEGER GENERATED ALWAYS AS (end_ts - start_ts) STORED,
  tokens_in     INTEGER DEFAULT 0,
  tokens_out    INTEGER DEFAULT 0,
  cost_usd      REAL DEFAULT 0.0,
  model         TEXT,
  provider      TEXT,
  status        TEXT DEFAULT 'ok',
  error_message TEXT,
  metadata      TEXT DEFAULT '{}',  -- JSON blob
  created_at    INTEGER NOT NULL
);
```

**Supporting tables**:
- `daily_stats` — Pre-aggregated statistics for fast dashboard queries
- `imports` — Tracks processed JSONL files to avoid re-import
- `schema_version` — Migration tracking

**Indexes**: 10+ indexes on common query patterns:
- `idx_spans_session` — Session lookup
- `idx_spans_agent` — Agent filtering
- `idx_spans_type` — Span type filtering
- `idx_spans_time` — Time range queries
- `idx_spans_model` — Model filtering
- Plus composite indexes for session list queries

**WAL Mode**: SQLite Write-Ahead Logging enabled for concurrent reads during live capture.

### 3. Query Engine (API)

**SpanReader**: `packages/plugin/src/db/reader.ts`

```typescript
class SpanReader {
  // Session queries
  getSessionList(filters: SessionListFilters): SessionSummary[];
  getSessionReplay(sessionId: string): Span[];
  getSpanTree(sessionId: string): SpanTree;

  // Analytics queries
  getAnalytics(queryType: string, params: AnalyticsParams): AnalyticsResult;

  // Topology queries
  getTopologyGraph(params: TopologyParams): TopologyGraph;
}
```

**API Endpoints**: `packages/plugin/src/api/*.ts`

- **GET `/api/sessions`** — List sessions with filters (agent, channel, status, time range)
- **GET `/api/sessions/:id/replay`** — Full session replay with hierarchical span tree
- **GET `/api/analytics/:queryType`** — Pre-built analytics queries
- **GET `/api/topology`** — Agent delegation graph

All endpoints return standardized `ApiResponse<T>` format with data/error/meta fields.

### 4. JSONL Importer

**Implementation**: `packages/plugin/src/importers/jsonl.ts`

The importer converts OpenClaw session JSONL files into ClawLens spans:

```
1. Find all *.jsonl files in sessions_dir
   ↓
2. Check imports table (skip if already processed)
   ↓
3. Parse JSONL line-by-line:
   - Session metadata → session span
   - Messages → turn spans
   - Tool calls → tool_exec spans
   - Model usage → llm_call spans
   ↓
4. Build span hierarchy using parent_id references
   ↓
5. Write spans to SQLite with source='jsonl'
   ↓
6. Record import in imports table with file hash
```

**Import Deduplication**: File hash stored in `imports` table prevents re-processing the same session file.

### 5. Web UI (React SPA)

**Architecture**: `packages/ui/src/`

```
App.tsx (React Router)
├── pages/
│   ├── SessionList.tsx     — Session list with filters
│   ├── SessionReplay.tsx   — Turn-by-turn timeline
│   ├── Analytics.tsx       — Query builder + charts
│   └── Topology.tsx        — Agent graph (D3)
├── components/
│   ├── Timeline.tsx        — Vertical timeline
│   ├── Waterfall.tsx       — Tool execution chart
│   ├── CostBar.tsx         — Running cost accumulator
│   └── SpanDetail.tsx      — Expandable span card
└── api/
    └── client.ts           — Typed API client
```

**Build Process**:
1. Vite builds React app to static files
2. Static files copied to `packages/plugin/dist/ui/`
3. Plugin serves static files at `/clawlens` route
4. API requests proxied to `/clawlens/api/*`

---

## Configuration System

**Config Loading**: `packages/plugin/src/config.ts`

**Priority** (highest to lowest):
1. Explicit plugin config (via OpenClaw plugin API)
2. YAML config file (`clawlens.config.yaml`)
3. Default values (`DEFAULT_CONFIG`)

**Config File Search Paths**:
1. OpenClaw workspace directory
2. Current working directory
3. `~/.openclaw/`
4. Home directory

**Validation**: All config values validated on load with `ConfigValidationError` thrown for invalid values.

---

## Performance Considerations

### SQLite Optimizations

- **WAL mode**: Enables concurrent reads during writes
- **Batched inserts**: Spans buffered and inserted in transactions
- **Indexes**: 10+ indexes for common query patterns
- **Generated columns**: `duration_ms` computed by SQLite, not application

### Data Retention

- **Auto-pruning**: Background job deletes spans older than `retention_days`
- **Soft delete**: Status field used, not hard deletion
- **Aggregation**: `daily_stats` table pre-computes rollups

### UI Performance

- **Static assets**: No runtime compilation
- **Pagination**: Session list uses limit/offset
- **Lazy loading**: Span details loaded on expand
- **Polling**: UI polls API every 5s for live updates

---

## Security Model

### Local-First

- **No network calls**: All data stays on local disk
- **No telemetry**: ClawLens doesn't phone home
- **File permissions**: SQLite inherits workspace permissions

### Data Isolation

- **Per-workspace databases**: Each workspace gets its own DB
- **No cross-workspace queries**: ClawLens only sees current workspace

---

## Extension Points

### Adding New Span Types

1. Add span type to `SpanType` in `packages/plugin/src/db/types.ts`
2. Create hook handler in `packages/plugin/src/hooks/`
3. Register hook in `packages/plugin/src/index.ts`
4. Add UI rendering in components

See [Contributing Guide](contributing-guide.md#adding-span-types) for examples.

### Adding New Analytics Queries

1. Add query type to `ANALYTICS_QUERY_TYPES` in `packages/plugin/src/api/analytics.ts`
2. Implement query in `SpanReader.getAnalytics()`
3. Add UI template in `packages/ui/src/pages/Analytics.tsx`

See [Contributing Guide](contributing-guide.md#adding-analytics-queries) for examples.

---

## Troubleshooting

### Plugin Not Loading

**Check**:
- OpenClaw version >= 2026.2.0
- Plugin installed: `npm list @clawlens/plugin`
- `enabled: true` in config

**Debug**: Set `verbose: true` in config

### No Sessions Appearing

**Check**:
- Sessions directory correct in config
- JSONL files exist: `ls ~/.openclaw/agents/*/sessions/`
- Import not skipped (check `imports` table)

**Debug**: Enable verbose logging

### UI Not Loading

**Check**:
- Plugin routes registered (check OpenClaw logs)
- UI build artifacts exist: `ls packages/plugin/dist/ui/`
- Browser console for errors

---

## Future Architecture

V2 architectural changes (from [Roadmap](roadmap.md)):

- **Postgres mode**: Optional backend for teams
- **SSE for live updates**: Replace polling
- **OTEL span import**: Direct collector integration
- **Plugin marketplace**: Custom query plugins

---

## References

- [Event Schema Reference](event-schema.md)
- [Contributing Guide](contributing-guide.md)
- [SQLite WAL Mode](https://www.sqlite.org/wal.html)
