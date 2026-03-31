# Live Flow Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the abstract 4-node flow diagram with an actionable live dashboard: stats strip, per-agent cards, enriched event feed with detail panel and action buttons.

**Architecture:** Two changes: (1) Backend extends `FlowEvent` to include cost, tokens, duration, model, sessionId, errorMessage fields. (2) Frontend rewrites `Flow.tsx` with three stacked sections — stats strip, agent cards, and split event/detail view. Polling mechanism stays unchanged. No new API endpoints.

**Tech Stack:** TypeScript, React, Tailwind CSS, Recharts (for Sparkline). Existing `Sparkline` component reused.

**Spec:** `docs/superpowers/specs/2026-03-30-live-flow-redesign.md`

---

### Task 1: Extend FlowEvent type with new data fields

**Files:**
- Modify: `packages/plugin/src/events/flow-bus.ts:18-28`

- [ ] **Step 1: Update the FlowEvent data interface**

Add the new fields the UI needs. These are all optional to maintain backwards compatibility with the in-memory flowBus emit calls (hooks don't have all these fields).

```typescript
export interface FlowEvent {
  type: 'span';
  data: {
    spanType: FlowSpanType;
    agentId: string;
    name: string;
    status: 'ok' | 'error' | 'pending';
    timestamp: number;
    metadata: Record<string, unknown>;
    // Enrichment fields (populated from DB spans, optional from hooks)
    costUsd?: number;
    tokensIn?: number;
    tokensOut?: number;
    durationMs?: number | null;
    model?: string | null;
    sessionId?: string;
    errorMessage?: string | null;
  };
}
```

- [ ] **Step 2: Verify no type errors**

Run: `cd packages/plugin && npx tsc --noEmit`
Expected: No errors (all existing emit calls are still valid since new fields are optional)

- [ ] **Step 3: Commit**

```bash
git add packages/plugin/src/events/flow-bus.ts
git commit -m "feat(flow): extend FlowEvent type with cost, tokens, duration, model fields"
```

---

### Task 2: Update spanToFlowEvent mapper to include new fields

**Files:**
- Modify: `packages/plugin/src/api/routes.ts:125-137`

- [ ] **Step 1: Update the mapper function**

The `spanToFlowEvent` function currently only maps 6 fields. Add all the enrichment fields from the `Span` object:

```typescript
function spanToFlowEvent(span: Span): FlowEvent {
  return {
    type: 'span',
    data: {
      spanType: SPAN_TYPE_TO_FLOW[span.spanType] ?? 'message_received',
      agentId: span.agentId,
      name: span.name,
      status: span.status === 'error' ? 'error' : 'ok',
      timestamp: span.startTs,
      metadata: span.metadata as Record<string, unknown> ?? {},
      costUsd: span.costUsd,
      tokensIn: span.tokensIn,
      tokensOut: span.tokensOut,
      durationMs: span.durationMs,
      model: span.model,
      sessionId: span.sessionId,
      errorMessage: span.errorMessage,
    },
  };
}
```

- [ ] **Step 2: Remove unused Span import if needed**

The `Span` type import from `../db/types.js` was added in the previous fix. Verify it's still there. The `SpanType` import should also be present (used by `SPAN_TYPE_TO_FLOW`).

- [ ] **Step 3: Verify build**

Run: `cd packages/plugin && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/plugin/src/api/routes.ts
git commit -m "feat(flow): include cost, tokens, duration, model in flow events"
```

---

### Task 3: Rewrite Flow.tsx — types, helpers, and polling

This task sets up the foundation: updated types, helper functions, and the polling hook. The old diagram components (FlowNode, FlowEdge, NodeId, FlowNodeDef, FLOW_NODES, spanTypeToNode, spanTypeToEdge) are removed.

**Files:**
- Modify: `packages/ui/src/pages/Flow.tsx` (lines 1-353 — everything above the render)

- [ ] **Step 1: Replace the types and helpers section**

Replace everything from line 1 through the `ACTIVE_DURATION_MS` constant (line 275) with:

```typescript
/**
 * Live Flow Dashboard
 *
 * Real-time agent activity dashboard with stats strip, per-agent cards,
 * enriched event feed, and span detail panel with action buttons.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Sparkline from '../components/Sparkline';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FlowSpanType =
  | 'session_start'
  | 'session_end'
  | 'message_received'
  | 'message_sent'
  | 'llm_output'
  | 'after_tool_call'
  | 'subagent_spawned'
  | 'subagent_ended';

interface FlowEventData {
  spanType: FlowSpanType;
  agentId: string;
  name: string;
  status: 'ok' | 'error' | 'pending';
  timestamp: number;
  metadata: Record<string, unknown>;
  costUsd?: number;
  tokensIn?: number;
  tokensOut?: number;
  durationMs?: number | null;
  model?: string | null;
  sessionId?: string;
  errorMessage?: string | null;
}

interface FlowEvent {
  type: 'span';
  data: FlowEventData;
}

interface AgentStats {
  agentId: string;
  llmCount: number;
  toolCount: number;
  totalCost: number;
  errorCount: number;
  lastModel: string | null;
  lastEventTs: number;
  costHistory: number[];
}

type FilterState = {
  agentId?: string;
  sessionId?: string;
  spanType?: FlowSpanType;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_FEED_EVENTS = 200;
const ACTIVE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

const SPAN_TYPE_LABELS: Record<FlowSpanType, string> = {
  session_start: 'Session',
  session_end: 'Session End',
  message_received: 'Turn',
  message_sent: 'Msg Sent',
  llm_output: 'LLM',
  after_tool_call: 'Tool',
  subagent_spawned: 'Subagent',
  subagent_ended: 'Sub End',
};

const SPAN_TYPE_COLORS: Record<FlowSpanType, string> = {
  session_start: 'text-cyan-400',
  session_end: 'text-slate-400',
  message_received: 'text-blue-400',
  message_sent: 'text-cyan-400',
  llm_output: 'text-purple-400',
  after_tool_call: 'text-amber-400',
  subagent_spawned: 'text-pink-400',
  subagent_ended: 'text-pink-300',
};

const SPAN_TYPE_BG: Record<string, string> = {
  session_start: 'bg-cyan-400/10',
  llm_output: 'bg-purple-400/10',
  after_tool_call: 'bg-amber-400/10',
  subagent_spawned: 'bg-pink-400/10',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatCost(usd: number | undefined): string {
  if (!usd || usd === 0) return '-';
  if (usd < 0.001) return '<$0.001';
  return `$${usd.toFixed(3)}`;
}

function formatTokens(n: number | undefined): string {
  if (!n || n === 0) return '-';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function formatDuration(ms: number | null | undefined): string {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return `${Math.floor(diff / 86400_000)}d ago`;
}

/** Derive per-agent stats from events array */
function deriveAgentStats(events: FlowEvent[]): AgentStats[] {
  const map = new Map<string, AgentStats>();

  for (const e of events) {
    const { agentId, spanType, costUsd, timestamp, model } = e.data;
    let stats = map.get(agentId);
    if (!stats) {
      stats = {
        agentId,
        llmCount: 0,
        toolCount: 0,
        totalCost: 0,
        errorCount: 0,
        lastModel: null,
        lastEventTs: 0,
        costHistory: [],
      };
      map.set(agentId, stats);
    }

    if (spanType === 'llm_output') {
      stats.llmCount++;
      if (model) stats.lastModel = model;
    }
    if (spanType === 'after_tool_call') stats.toolCount++;
    if (e.data.status === 'error') stats.errorCount++;
    if (costUsd && costUsd > 0) {
      stats.totalCost += costUsd;
      stats.costHistory.push(costUsd);
    }
    if (timestamp > stats.lastEventTs) stats.lastEventTs = timestamp;
  }

  return Array.from(map.values()).sort((a, b) => b.lastEventTs - a.lastEventTs);
}
```

- [ ] **Step 2: Verify the file compiles (partial — the render section comes in later tasks)**

At this point the file is incomplete (no default export yet). That's expected — we'll add the components in the next tasks.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/pages/Flow.tsx
git commit -m "feat(flow): replace types, helpers, and constants for new dashboard"
```

---

### Task 4: Flow.tsx — StatsStrip and AgentCard components

**Files:**
- Modify: `packages/ui/src/pages/Flow.tsx` (add after helpers section)

- [ ] **Step 1: Add ConnectionStatus component** (kept from original)

```typescript
// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function ConnectionStatus({ connected }: { connected: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <div
        className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`}
      />
      <span className={connected ? 'text-green-400' : 'text-red-400'}>
        {connected ? 'Connected' : 'Disconnected'}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Add StatsStrip component**

```typescript
function StatsStrip({ events }: { events: FlowEvent[] }) {
  const stats = useMemo(() => {
    const sessions = new Set(events.map((e) => e.data.sessionId).filter(Boolean));
    const totalCost = events.reduce((sum, e) => sum + (e.data.costUsd ?? 0), 0);
    const tokensIn = events.reduce((sum, e) => sum + (e.data.tokensIn ?? 0), 0);
    const tokensOut = events.reduce((sum, e) => sum + (e.data.tokensOut ?? 0), 0);
    const errors = events.filter((e) => e.data.status === 'error').length;
    const llmSpans = events.filter(
      (e) => e.data.spanType === 'llm_output' && e.data.durationMs
    );
    const avgLatency =
      llmSpans.length > 0
        ? llmSpans.reduce((sum, e) => sum + (e.data.durationMs ?? 0), 0) / llmSpans.length
        : 0;

    return { sessions: sessions.size, totalCost, tokensIn, tokensOut, errors, avgLatency };
  }, [events]);

  const items = [
    { label: 'Active Sessions', value: String(stats.sessions), color: 'text-white' },
    { label: 'Total Cost', value: formatCost(stats.totalCost), color: 'text-emerald-400' },
    {
      label: 'Tokens (In / Out)',
      value: `${formatTokens(stats.tokensIn)} / ${formatTokens(stats.tokensOut)}`,
      color: 'text-blue-400',
    },
    { label: 'Errors', value: String(stats.errors), color: stats.errors > 0 ? 'text-red-400' : 'text-white' },
    { label: 'Avg Latency', value: formatDuration(stats.avgLatency), color: 'text-amber-400' },
  ];

  return (
    <div className="grid grid-cols-5 gap-3 mb-4">
      {items.map((item) => (
        <div key={item.label} className="bg-slate-800 rounded-lg p-3 border border-slate-700">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">{item.label}</div>
          <div className={`text-xl font-bold mt-0.5 ${item.color}`}>{item.value}</div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Add AgentCard component**

```typescript
function AgentCard({ stats, onFilter }: { stats: AgentStats; onFilter: (agentId: string) => void }) {
  const navigate = useNavigate();
  const isActive = Date.now() - stats.lastEventTs < ACTIVE_THRESHOLD_MS;

  return (
    <div
      className={`flex-1 min-w-[260px] bg-slate-800 rounded-lg p-3 border border-slate-700 ${
        isActive ? 'border-l-[3px] border-l-emerald-500' : 'border-l-[3px] border-l-slate-600'
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-base">🤖</span>
        <span className="text-white font-bold text-sm">{stats.agentId}</span>
        <span
          className={`text-[9px] font-semibold px-2 py-0.5 rounded-full ${
            isActive
              ? 'bg-emerald-900/50 text-emerald-400'
              : 'bg-slate-700 text-slate-400'
          }`}
        >
          {isActive ? 'ACTIVE' : 'IDLE'}
        </span>
        <span className="text-[10px] text-slate-500 ml-auto">
          {formatRelativeTime(stats.lastEventTs)}
        </span>
      </div>
      {/* Row 1: Key stats */}
      <div className="flex gap-3 text-xs text-slate-400 mb-2">
        <span>🧠 <span className="text-slate-200">{stats.llmCount}</span> LLM</span>
        <span>🔧 <span className="text-slate-200">{stats.toolCount}</span> tools</span>
        <span>💰 <span className="text-emerald-400">{formatCost(stats.totalCost)}</span></span>
        {stats.errorCount > 0 && (
          <span>⚠️ <span className="text-amber-400">{stats.errorCount}</span></span>
        )}
      </div>
      {/* Row 2: Model, sparkline, link */}
      <div className="flex items-center gap-2 text-[10px] text-slate-500">
        {stats.lastModel && (
          <span className="bg-slate-900 border border-slate-700 px-1.5 py-0.5 rounded text-purple-400 text-[9px] truncate max-w-[120px]">
            {stats.lastModel}
          </span>
        )}
        <div className="w-16 h-4 flex-shrink-0">
          <Sparkline data={stats.costHistory.slice(-20)} color="#10b981" height={16} />
        </div>
        <button
          onClick={() => navigate(`/sessions?agentId=${stats.agentId}`)}
          className="text-blue-400 hover:text-blue-300 underline ml-auto"
        >
          Sessions →
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/pages/Flow.tsx
git commit -m "feat(flow): add StatsStrip and AgentCard components"
```

---

### Task 5: Flow.tsx — Enriched EventFeed and DetailPanel components

**Files:**
- Modify: `packages/ui/src/pages/Flow.tsx` (add after AgentCard)

- [ ] **Step 1: Add EnrichedEventFeed component**

```typescript
function EnrichedEventFeed({
  events,
  selectedIndex,
  onSelect,
}: {
  events: FlowEvent[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
}) {
  const feedRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll && feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [events.length, autoScroll]);

  const handleScroll = useCallback(() => {
    if (!feedRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = feedRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 50);
  }, []);

  return (
    <div className="flex-[3] bg-slate-900 rounded-lg border border-slate-700 overflow-hidden flex flex-col">
      <div className="px-3 py-2 border-b border-slate-700 flex items-center justify-between">
        <span className="text-xs font-semibold text-white">Event Feed</span>
        <span className="text-[10px] text-slate-500">{events.length} events</span>
      </div>
      <div
        ref={feedRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-1 font-mono text-[11px]"
      >
        {events.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-500 text-xs">
            Waiting for events...
          </div>
        ) : (
          events.map((event, i) => {
            const d = event.data;
            const isSelected = selectedIndex === i;
            const isError = d.status === 'error';

            return (
              <div
                key={`${d.timestamp}-${i}`}
                onClick={() => onSelect(i)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer ${
                  isSelected
                    ? 'bg-slate-800 border-l-2 border-l-blue-400'
                    : isError
                      ? 'bg-red-950/30 hover:bg-red-950/50'
                      : 'hover:bg-slate-800/50'
                }`}
              >
                <span className="text-slate-500 w-[52px] shrink-0">{formatTime(d.timestamp)}</span>
                <span
                  className={`w-[42px] shrink-0 font-semibold ${
                    SPAN_TYPE_COLORS[d.spanType] ?? 'text-slate-300'
                  }`}
                >
                  {SPAN_TYPE_LABELS[d.spanType] ?? d.spanType}
                </span>
                <span className={`flex-1 truncate ${isError ? 'text-red-300' : 'text-slate-300'}`}>
                  {isError && d.errorMessage ? `${d.name} — ${d.errorMessage}` : d.name}
                </span>
                {d.durationMs ? (
                  <span className="text-[9px] bg-slate-800 px-1 rounded text-slate-400 shrink-0">
                    {formatDuration(d.durationMs)}
                  </span>
                ) : null}
                <span className="w-[48px] text-right shrink-0 text-emerald-400">
                  {formatCost(d.costUsd)}
                </span>
                <span className="w-[40px] text-right shrink-0 text-slate-500">{d.agentId}</span>
              </div>
            );
          })
        )}
      </div>
      {!autoScroll && (
        <button
          onClick={() => setAutoScroll(true)}
          className="w-full py-1 text-[10px] text-center text-cyan-400 hover:bg-slate-800 border-t border-slate-700"
        >
          Resume auto-scroll
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add DetailPanel component**

```typescript
function DetailPanel({
  event,
  onFilter,
}: {
  event: FlowEvent | null;
  onFilter: (filter: FilterState) => void;
}) {
  const navigate = useNavigate();

  if (!event) {
    return (
      <div className="flex-[2] bg-slate-900 rounded-lg border border-slate-700 flex items-center justify-center">
        <span className="text-slate-500 text-xs">Click an event to view details</span>
      </div>
    );
  }

  const d = event.data;

  const fields: [string, string | null, string?][] = [
    ['Agent', d.agentId],
    ['Model', d.model ?? null, 'text-purple-400'],
    ['Duration', formatDuration(d.durationMs)],
    ['Tokens In', formatTokens(d.tokensIn)],
    ['Tokens Out', formatTokens(d.tokensOut)],
    ['Cost', formatCost(d.costUsd), 'text-emerald-400'],
    ['Status', d.status.toUpperCase(), d.status === 'error' ? 'text-red-400' : 'text-emerald-400'],
    ...(d.errorMessage ? [['Error', d.errorMessage, 'text-red-300'] as [string, string, string]] : []),
    ['Session', d.sessionId ? `${d.sessionId.slice(0, 12)}...` : '-', 'text-blue-400'],
    ['Time', formatTime(d.timestamp)],
  ];

  return (
    <div className="flex-[2] bg-slate-900 rounded-lg border border-slate-700 overflow-hidden flex flex-col">
      <div className="px-3 py-2 border-b border-slate-700 flex items-center gap-2">
        <span className="text-xs font-semibold text-white">Span Detail</span>
        <span
          className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${
            SPAN_TYPE_BG[d.spanType] ?? 'bg-slate-800'
          } ${SPAN_TYPE_COLORS[d.spanType] ?? 'text-slate-300'}`}
        >
          {SPAN_TYPE_LABELS[d.spanType] ?? d.spanType}
        </span>
      </div>
      <div className="flex-1 px-3 py-2 overflow-auto">
        <div className="text-white font-semibold text-sm mb-2 truncate">{d.name}</div>
        <div className="grid grid-cols-[72px_1fr] gap-y-1 gap-x-2 text-[11px] mb-3">
          {fields.map(([label, value, color]) =>
            value ? (
              <div key={label} className="contents">
                <span className="text-slate-500">{label}</span>
                <span className={color ?? 'text-slate-200'}>{value}</span>
              </div>
            ) : null
          )}
        </div>
        {/* Action buttons */}
        <div className="border-t border-slate-700 pt-2 grid grid-cols-2 gap-1.5">
          {d.sessionId && (
            <button
              onClick={() => navigate(`/replay/${d.sessionId}`)}
              className="bg-slate-800 border border-slate-700 text-blue-400 hover:bg-slate-700 px-2 py-1.5 rounded text-[10px] font-medium"
            >
              🔍 Open Replay
            </button>
          )}
          <button
            onClick={() => onFilter({ agentId: d.agentId })}
            className="bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 px-2 py-1.5 rounded text-[10px] font-medium"
          >
            🤖 Filter Agent
          </button>
          {d.sessionId && (
            <button
              onClick={() => onFilter({ sessionId: d.sessionId })}
              className="bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 px-2 py-1.5 rounded text-[10px] font-medium"
            >
              📋 Filter Session
            </button>
          )}
          <button
            onClick={() => onFilter({ spanType: d.spanType })}
            className="bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 px-2 py-1.5 rounded text-[10px] font-medium"
          >
            ⚡ Filter Type
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/pages/Flow.tsx
git commit -m "feat(flow): add EnrichedEventFeed and DetailPanel components"
```

---

### Task 6: Flow.tsx — Main page component with polling and state

**Files:**
- Modify: `packages/ui/src/pages/Flow.tsx` (replace the `export default function Flow()` and everything after it)

- [ ] **Step 1: Add the main Flow component**

Replace the old `export default function Flow()` (and the trailing `<style>` block) with:

```typescript
// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function Flow() {
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<FlowEvent[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [filter, setFilter] = useState<FilterState>({});

  // Polling — identical mechanism to the original, just stores events
  useEffect(() => {
    let lastTs = 0;
    let mounted = true;

    const poll = async () => {
      try {
        const res = await fetch(
          `${window.location.origin}/clawlens/api/flow/events?since=${lastTs}`
        );
        if (!res.ok) throw new Error('Failed to fetch');
        const body = await res.json();
        if (!mounted) return;

        setConnected(true);

        const newEvents: FlowEvent[] = body.data ?? [];
        if (newEvents.length > 0) {
          lastTs = Math.max(...newEvents.map((e) => e.data.timestamp));
          setEvents((prev) => {
            const next = [...prev, ...newEvents];
            return next.length > MAX_FEED_EVENTS ? next.slice(-MAX_FEED_EVENTS) : next;
          });
        }
      } catch {
        if (mounted) setConnected(false);
      }
    };

    poll();
    const interval = setInterval(poll, 2000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // Derive agent stats from all events
  const agentStats = useMemo(() => deriveAgentStats(events), [events]);

  // Apply filters to events for the feed
  const filteredEvents = useMemo(() => {
    if (!filter.agentId && !filter.sessionId && !filter.spanType) return events;
    return events.filter((e) => {
      if (filter.agentId && e.data.agentId !== filter.agentId) return false;
      if (filter.sessionId && e.data.sessionId !== filter.sessionId) return false;
      if (filter.spanType && e.data.spanType !== filter.spanType) return false;
      return true;
    });
  }, [events, filter]);

  const selectedEvent = selectedIndex !== null ? filteredEvents[selectedIndex] ?? null : null;

  const handleFilter = useCallback((newFilter: FilterState) => {
    setFilter(newFilter);
    setSelectedIndex(null);
  }, []);

  const clearFilter = useCallback(() => {
    setFilter({});
    setSelectedIndex(null);
  }, []);

  const hasActiveFilter = filter.agentId || filter.sessionId || filter.spanType;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Live Flow</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Real-time agent activity dashboard
          </p>
        </div>
        <ConnectionStatus connected={connected} />
      </div>

      {/* Section 1: Stats Strip */}
      <StatsStrip events={events} />

      {/* Section 2: Agent Cards */}
      {agentStats.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-4">
          {agentStats.map((stats) => (
            <AgentCard
              key={stats.agentId}
              stats={stats}
              onFilter={(agentId) => handleFilter({ agentId })}
            />
          ))}
        </div>
      )}

      {/* Filter indicator */}
      {hasActiveFilter && (
        <div className="flex items-center gap-2 mb-2 text-xs">
          <span className="text-slate-400">Filtered:</span>
          {filter.agentId && (
            <span className="bg-slate-800 border border-slate-700 text-blue-400 px-2 py-0.5 rounded">
              Agent: {filter.agentId}
            </span>
          )}
          {filter.sessionId && (
            <span className="bg-slate-800 border border-slate-700 text-blue-400 px-2 py-0.5 rounded">
              Session: {filter.sessionId.slice(0, 12)}...
            </span>
          )}
          {filter.spanType && (
            <span className="bg-slate-800 border border-slate-700 text-blue-400 px-2 py-0.5 rounded">
              Type: {SPAN_TYPE_LABELS[filter.spanType]}
            </span>
          )}
          <button onClick={clearFilter} className="text-slate-400 hover:text-white">
            ✕ Clear
          </button>
        </div>
      )}

      {/* Section 3: Split Event View */}
      <div className="flex gap-3" style={{ height: 'calc(100vh - 380px)', minHeight: '300px' }}>
        <EnrichedEventFeed
          events={filteredEvents}
          selectedIndex={selectedIndex}
          onSelect={setSelectedIndex}
        />
        <DetailPanel event={selectedEvent} onFilter={handleFilter} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Remove old custom animation styles**

The old `<style>` block with `@keyframes flow-right` / `flow-left` and `.animate-flow` classes is no longer needed. Make sure it's not in the new component.

- [ ] **Step 3: Build and verify**

Run: `pnpm --filter clawlens build`
Expected: Build succeeds with no errors

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/pages/Flow.tsx
git commit -m "feat(flow): complete dashboard rewrite with stats, agent cards, and split view"
```

---

### Task 7: Build, deploy, and verify

**Files:**
- No source changes — build and deploy only

- [ ] **Step 1: Full build**

```bash
pnpm --filter clawlens build
```

Expected: Both plugin and UI build successfully

- [ ] **Step 2: Deploy to extensions directory**

```bash
cp -r packages/plugin/dist/* ~/.openclaw/extensions/clawlens/dist/
```

- [ ] **Step 3: Restart OpenClaw and verify**

1. Open http://127.0.0.1:18789/clawlens/ and navigate to Live Flow
2. Verify stats strip shows computed values (sessions, cost, tokens, errors, latency)
3. Verify agent cards appear with per-agent breakdown
4. Verify event feed shows enriched rows (timestamp, type, name, duration, cost, agent)
5. Click an event — verify detail panel populates with full span info
6. Click "Open Replay" — verify it navigates to the replay page
7. Click "Filter Agent" — verify the feed filters to that agent only
8. Click "Clear" on the filter bar — verify it resets
9. Verify error rows have red tint and show error message
10. Verify auto-scroll works (scroll to bottom on new events)

- [ ] **Step 4: Commit any fixes if needed**

```bash
git add -A
git commit -m "fix(flow): address issues found during verification"
```
