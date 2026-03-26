# Scheduled Jobs Dashboard — Design Spec

## Problem

The default OpenClaw cron UI is a flat list of jobs with minimal context. It doesn't show run history trends, cost visibility, at-a-glance health, or deep-dive into individual runs. ClawLens should provide an investigation-quality view of scheduled workflows.

## Design

### Layout: Hybrid Summary Strip + Sortable Table

**Route:** `/cron` — new page in the ClawLens UI sidebar

**Page sections (top to bottom):**

1. **Header** — "Scheduled Jobs" title, refresh button, poll interval selector (Manual/30s/1m/5m, same pattern as Bots page)

2. **Summary strip** — 4 stat cards in a horizontal row:
   - Active Jobs (enabled count / total count)
   - Failing (jobs with `consecutiveErrors > 0`, red border)
   - Next Run (countdown timer + job name; shows "--" if no active job has `state.nextRunAtMs`)
   - Est. Daily Cost (avg cost per run * daily frequency, summed across active jobs)

3. **Filters** — search by job name, agent dropdown, status filter (All / OK / Failing / Disabled)

4. **Sortable table** — columns:
   - Job name (bold)
   - Agent (muted)
   - Schedule (human-readable, e.g., "daily at 5:00 AM")
   - Last Run (relative time)
   - Duration (of last run)
   - Cost (of last run)
   - Status badge (OK / ERR x N / OFF). Read from `state.lastStatus || state.lastRunStatus` (both field names exist in the data)
   - History (last 7-10 runs as colored dots: green=ok, red=error, gray=disabled)

   Failing rows get a subtle red tint background (`rgba(127,29,29,0.15)`).
   Disabled rows render at reduced opacity.

5. **Row expansion** — clicking a table row expands inline to show:
   - Job metadata (schedule expression, delivery channel + `deliveryStatus`, model, last error message)
   - Last 20 runs in a mini-table: timestamp, status, duration, cost, summary preview
   - Each successful run links to ClawLens session replay via parsed `sessionId` (grayed out if session not in ClawLens DB)

### Data Sources

All data is read directly from the filesystem (no gateway API dependency):

- **Job definitions:** `~/.openclaw/cron/jobs.json` — wrapper structure `{ version: 1, jobs: [...] }`. Each job has: `id`, `name`, `agentId`, `enabled`, `schedule`, `payload`, `state`, `delivery`, `sessionTarget`, `wakeMode`, `deleteAfterRun`, `description`, `createdAtMs`, `updatedAtMs`. Note `deleteAfterRun` (one-shot jobs) and `description` (useful in expanded detail). Ignore `.bak` and `.tmp` files in the same directory.
- **Run history:** `~/.openclaw/cron/runs/<jobId>.jsonl` — one JSON line per run event with `ts`, `jobId`, `action`, `status`, `summary`, `sessionId`, `sessionKey`, `runAtMs`, `durationMs`, `model`, `provider`, `usage` (token counts), `deliveryStatus`, `nextRunAtMs`. Use `runAtMs` (not `ts`) for "Last Run" display. Skip unparseable lines gracefully.
- **Session correlation:** Run event `sessionKey` format is `agent:<agentId>:cron:<jobId>:run:<sessionId>` — parse `sessionId` to link to ClawLens replay
- **Cost derivation:** Run events have raw token counts (`usage.input_tokens`, etc.) but no cost field. To get cost: look up the `sessionId` from the run event in the ClawLens span DB (`spans` table has `cost_usd`). If the session exists in ClawLens, use the aggregated `cost_usd`. If not, show "--" for cost. This avoids maintaining a model pricing table.

**Error handling:** `cron-reader.ts` must gracefully handle: missing `~/.openclaw/cron/` directory (return empty arrays), missing `jobs.json`, missing run files for a job ID, corrupted/partial JSONL lines (skip with warning). This mirrors how ClawLens handles missing session JSONL files.

### Backend

**New module:** `packages/plugin/src/cron/`

**Database: `cron_runs` table** — added to the existing ClawLens SQLite database (better-sqlite3). Cron run data is synced from JSONL files into this table, then queried with SQL.

```sql
CREATE TABLE IF NOT EXISTS cron_runs (
  row_id        INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id        TEXT    NOT NULL,
  ts            INTEGER NOT NULL,   -- epoch ms when record was written
  run_at_ms     INTEGER,            -- epoch ms when run was scheduled
  status        TEXT,               -- ok | error
  error         TEXT,
  duration_ms   INTEGER,
  model         TEXT,
  provider      TEXT,
  summary       TEXT,
  session_id    TEXT,               -- links to ClawLens spans
  session_key   TEXT,
  delivered     INTEGER DEFAULT 0,  -- 0/1 bool
  tokens_in     INTEGER,
  tokens_out    INTEGER,
  UNIQUE(job_id, ts)
);
CREATE INDEX idx_cron_runs_job_time ON cron_runs(job_id, ts DESC);
CREATE INDEX idx_cron_runs_status ON cron_runs(status) WHERE status = 'error';
```

**`cron-reader.ts`** — reads and syncs data:
- `readCronJobs()` — parses `jobs.json` (wrapper: `{ version, jobs: [...] }`), caches for 30s (same TTL pattern as `openclaw-config.ts`)
- `syncCronRuns()` — on startup and periodically, reads each JSONL file in `~/.openclaw/cron/runs/`, uses `INSERT OR IGNORE` to append only new entries. With 60 jobs and ~71 entries each (~4,260 rows), full sync takes under 1 second.
- Incremental sync: compare max `ts` per job_id against JSONL entries, only insert newer rows

**`cron-queries.ts`** — SQL queries against `cron_runs` table:
- `getCronSummary(jobs)` — active count, failing count, next-up job, daily cost estimate (joins `cron_runs` with `spans` for cost via `session_id`)
- `getJobsWithStats(jobs)` — merges job definitions with computed stats from SQL (avg duration, success rate, last N run statuses)
- `getJobRuns(jobId, limit, offset)` — paginated run history for one job
- `getRecentErrors(limit)` — recent errors across all jobs

**API endpoints** (registered in `routes.ts`):
- `GET /clawlens/api/cron/jobs` — all jobs with computed stats and last N run results
- `GET /clawlens/api/cron/jobs/:id/runs` — full run history for one job (supports `limit` and `offset` params)
- `GET /clawlens/api/cron/summary` — summary strip data

### Frontend

**New files:**
- `packages/ui/src/pages/CronJobs.tsx` — the page component
- `packages/ui/src/hooks/useCronJobs.ts` — data fetching hook with polling support
- `packages/ui/src/utils/schedule-human.ts` — schedule object to human-readable text converter (handles cron, at, every kinds)

**Modified files:**
- `packages/ui/src/App.tsx` — add `/cron` route
- `packages/ui/src/components/Layout.tsx` — add "Scheduled" sidebar entry (clock icon, positioned between Bots and Sessions)
- `packages/ui/src/api/client.ts` — add typed API functions for cron endpoints

**Reused patterns:**
- Poll interval selector from Bots page
- Sortable table from SessionList page
- Status badges and color mapping from SessionList
- `formatDuration()`, `formatTokens()` utilities

### Schedule → Human Readable

Utility (`schedule-human.ts`) that handles all three schedule kinds:

**`kind: "cron"`** (56 jobs) — cron expression + timezone:
- `0 5 * * *` → "daily at 5:00 AM"
- `0 */6 * * *` → "every 6 hours"
- `0 9 * * 1-5` → "weekdays at 9:00 AM"
- `0 10 * * 0` → "Sundays at 10:00 AM"
- Falls back to raw expression for complex patterns

**`kind: "at"`** (3 jobs) — one-shot scheduled time:
- `{ kind: "at", at: "2025-01-30T16:51:00Z" }` → "once at Jan 30, 2025 4:51 PM"

**`kind: "every"`** (1 job) — interval-based recurring:
- `{ kind: "every", everyMs: 28800000 }` → "every 8 hours"

### Scope Boundaries

**In scope:**
- Read-only dashboard (observe and analyze)
- Job list with stats, run history, cost tracking
- Session replay drill-down via sessionId correlation
- Polling with configurable interval

**Out of scope (v1):**
- Run Now button (requires gateway API write + auth)
- Enable/disable jobs
- Cost trend charts over time (future analytics addition)
- Cron job from Bots page agent cards

## Verification

1. `pnpm typecheck` passes
2. `pnpm build` succeeds
3. Navigate to `/clawlens/cron` — page loads with real cron job data
4. Summary strip shows correct counts and daily cost
5. Table is sortable by all columns
6. Filters work (search, agent, status)
7. Click a row to expand and see run history
8. Click "View" on a run to navigate to session replay
9. Polling refreshes data at selected interval
