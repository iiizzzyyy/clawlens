# Live Flow Redesign — Insightful & Actionable Dashboard

## Problem

The Live Flow page shows a static 4-node diagram (User → Channel → Brain → Tools) with event counts and a raw event feed. It answers "is something happening?" but not "what's happening?", "where's the money going?", or "what went wrong?". Event rows all look identical — no cost, tokens, duration, model, or error details visible.

## Design

Replace the abstract flow diagram with a three-section stacked layout:

### Section 1: Stats Strip

Five live counters across the top, updated on each poll:

| Stat | Source | Format |
|------|--------|--------|
| Active Sessions | Count distinct `sessionId` from recent events | Integer |
| Total Cost | Sum `costUsd` | `$X.XX` |
| Tokens In / Out | Sum `tokensIn`, `tokensOut` | `X.XK / X.XK` |
| Errors | Count events where `status === 'error'` | Integer, red if > 0 |
| Avg Latency | Mean `durationMs` for LLM spans | `X.Xs` |

Stats are computed client-side from the events array. No new API endpoints needed.

### Section 2: Agent Cards

One card per agent (derived by grouping events by `agentId`). Each card shows:

- **Header**: Agent emoji + name + status badge (Active/Idle based on last event recency) + last activity relative time
- **Row 1**: LLM count, tool count, cost total, error count
- **Row 2**: Model badge (from most recent LLM event), cost sparkline (last N events), "Sessions →" link (navigates to `/sessions?agentId=X`)

Status logic:
- **Active** (green): last event < 5 minutes ago
- **Idle** (gray): last event >= 5 minutes ago

Cards are arranged in a responsive flex row that wraps.

### Section 3: Split Event View

Left panel (60%) — **Enriched Event Feed**:
- Each row: timestamp, type badge (color-coded), name, duration badge, cost, agent ID
- Error rows: red background tint, error message shown in name field
- Click a row to select it and populate the detail panel
- Auto-scroll with manual override (existing behavior preserved)

Right panel (40%) — **Detail Panel with Actions**:
- Shows when an event is selected (empty state: "Click an event to view details")
- Span fields: agent, model, duration, tokens in/out, cost, status, error message (if error), session ID, timestamp
- Action buttons:
  - **Open Replay** → navigates to `/replay/{sessionId}`
  - **Filter Agent** → filters the event feed to show only this agent's events
  - **Filter Session** → filters to this session only
  - **Filter Type** → filters to this span type only

## Data Requirements

The existing `/clawlens/api/flow/events` endpoint already returns `FlowEvent` objects mapped from database spans. The current `FlowEvent.data` shape:

```typescript
{
  spanType, agentId, name, status, timestamp, metadata
}
```

This needs to be extended to include fields the UI now needs:

```typescript
{
  spanType, agentId, name, status, timestamp, metadata,
  // New fields:
  costUsd, tokensIn, tokensOut, durationMs, model, sessionId, errorMessage
}
```

**Backend change**: Update `spanToFlowEvent()` in `routes.ts` to include these fields from the Span object. Also update the `FlowEvent` type in `flow-bus.ts`.

**Frontend change**: Update the `FlowEventData` interface in `Flow.tsx` to accept the new fields.

## Files to Modify

### Backend (plugin)
- `packages/plugin/src/events/flow-bus.ts` — Extend `FlowEvent.data` interface with new fields
- `packages/plugin/src/api/routes.ts` — Update `spanToFlowEvent()` mapper to include cost, tokens, duration, model, sessionId, errorMessage

### Frontend (UI)
- `packages/ui/src/pages/Flow.tsx` — Complete rewrite of the page component:
  - Remove the 4-node diagram (FlowNode, FlowEdge components)
  - Add StatsStrip component
  - Add AgentCards component
  - Add enriched EventFeed component (replacing existing EventFeed)
  - Add DetailPanel component
  - Add filter state management
  - Reuse existing Sparkline component from `components/Sparkline.tsx`

## Out of Scope

- Historical replay / time scrubbing (future feature)
- WebSocket or SSE transport (gateway buffers; polling stays)
- New API endpoints (all data comes from existing flow/events endpoint)
- Per-agent drill-down page (the "Sessions →" link goes to the existing session list)
