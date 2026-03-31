# Session Watchdog — Design Spec

## Context

ClawLens captures comprehensive agent lifecycle data but has no active intervention capabilities. When agent sessions stall, crash, or fail, users only discover problems by manually checking the dashboard. The [openclaw-loop-watchdog](https://github.com/abwuge/openclaw-loop-watchdog) plugin solves this with flag-file-based detection and auto-wake, but it operates independently of ClawLens's rich span data.

This design adds three layered capabilities to ClawLens: health detection, alert notifications, and opt-in auto-recovery. Unlike the standalone watchdog (which uses flag files and text markers), this implementation leverages ClawLens's existing spans database and OpenClaw lifecycle hooks for detection, and the plugin runtime API for recovery actions.

## Architecture

Three new modules inside `packages/plugin/src/watchdog/`:

```
src/watchdog/
  detector.ts    — Session health classification + sweep logic
  alerter.ts     — Channel-based notifications with cooldown
  recovery.ts    — Auto-wake via subagent.run() with retry caps
  types.ts       — Shared types (HealthState, WatchdogIssue, etc.)
  index.ts       — Hook registration + sweep scheduler
```

New UI page + API routes + integration with existing pages.

**Lifecycle:** The watchdog sweep interval is stored in `pluginState` and cleared on `shutdown()`, matching the existing cron sync pattern.

## Detection Engine (`detector.ts`)

### Health States

| State | Detection Rule |
|-------|---------------|
| **Stalled** | `session` span with `end_ts = NULL` AND no child spans in last 5 minutes (configurable) |
| **Failed** | `session` span with `status = 'error'` or `'timeout'` |
| **Crashed** | `session` span with `end_ts = NULL` AND detected during `gateway_start` (orphaned) |
| **Recovered** | Previously flagged session that has resumed activity |

### Detection Paths

**Real-time:** Register `agent_end` hook. On session end, check final status — if error/timeout, immediately flag and trigger alert/recovery pipeline.

**Periodic sweep:** Every 60 seconds, query spans DB for:
```sql
SELECT s.id, s.session_id, s.agent_id, s.start_ts, s.status, s.error_message,
       MAX(c.start_ts) as last_child_ts
FROM spans s
LEFT JOIN spans c ON c.session_id = s.session_id AND c.id != s.id
WHERE s.span_type = 'session'
  AND s.end_ts IS NULL
  AND s.start_ts < :staleThreshold
GROUP BY s.id
HAVING last_child_ts IS NULL OR last_child_ts < :staleThreshold
```

**Required index:** Add `CREATE INDEX idx_spans_session_start ON spans(session_id, start_ts)` for efficient child-activity lookups in the sweep query.

**Gateway recovery:** Register `gateway_start` hook. On restart, scan for all open session spans — these are orphaned from the previous gateway process.

### Issue Tracking

In-memory map of `sessionId → WatchdogIssue`:
```typescript
interface WatchdogIssue {
  sessionId: string;
  agentId: string;
  spanId: string;
  state: 'stalled' | 'failed' | 'crashed';
  detectedAt: number;
  lastAlertAt?: number;
  recoveryAttempts: number;
  recoveryStatus: 'pending' | 'attempted' | 'succeeded' | 'exhausted';
  dismissed: boolean;
}
```

Issues are cleared when:
- The session resumes (new child span detected in sweep)
- The session ends with `status = 'ok'`
- A user dismisses the issue via API

## Alert System (`alerter.ts`)

### Notification Flow

1. Detector flags a session → passes `WatchdogIssue` to alerter
2. Alerter checks cooldown (default 5min per session)
3. If not in cooldown, sends notification to all configured channels
4. Records `lastAlertAt` on the issue

### Alert Content

```
[ClawLens] Session stalled: agent "researcher" (session abc123)
Duration: 12m 34s | Last activity: 5m ago
Error: context window exceeded
View: http://localhost:PORT/clawlens/sessions/abc123/replay
```

### Channel Integration

**V1: Webhook-based notifications.** The OpenClaw channel APIs (`runtime.channel.slack.sendMessageSlack()`, etc.) require complex parameters (bot tokens, chat IDs, message payload objects) that would need a significant adapter layer. For the initial implementation, use a simpler webhook approach:

```yaml
alerts:
  channels:
    - type: webhook
      url: "https://hooks.slack.com/services/T.../B.../xxx"
    - type: webhook
      url: "https://discord.com/api/webhooks/xxx/yyy"
```

The alerter sends a JSON POST to each configured webhook URL with a standard payload. This works with Slack incoming webhooks, Discord webhooks, and any custom endpoint. Native channel integration (using OpenClaw's channel APIs with proper credential resolution) can be added in a future iteration.

**Webhook payload:**
```json
{
  "text": "[ClawLens] Session stalled: agent \"researcher\" (session abc123)",
  "details": {
    "agentId": "researcher",
    "sessionId": "abc123",
    "state": "stalled",
    "duration": "12m 34s",
    "lastActivity": "5m ago",
    "error": "context window exceeded",
    "replayUrl": "http://localhost:PORT/clawlens/sessions/abc123/replay"
  }
}
```

### Cooldown

In-memory `Map<sessionId, lastAlertTs>`. Resets on gateway restart (acceptable — re-alerting after restart is preferable to missing alerts).

## Auto-Recovery (`recovery.ts`)

### Recovery Flow

1. Detector flags a stalled/crashed session
2. If `recovery.enabled` and agent not in `excludeAgents`:
   a. Check retry count < `maxRetries` (default 2)
   b. Check cooldown since last attempt (default 5min)
   c. Build session key: `agent:{agentId}:session:{sessionId}`
   d. Call `api.runtime.subagent.run()` with idempotency key
   e. Increment `recoveryAttempts`
3. If max retries exceeded → alert with "manual intervention needed"

### Recovery Limitations

`subagent.run()` sends a new message to an existing session. This works when:
- The agent process is still running but idle (most common stall case)
- The gateway restarted and the session can be resumed

This does NOT work when:
- The agent is stuck in a blocking tool call (message queues but doesn't unstall)
- The agent process has crashed and the session key is no longer routable

The recovery module should log the `subagent.run()` result and mark recovery as `succeeded` only if the session subsequently shows new activity (detected in the next sweep). If the session remains stalled after a wake attempt, it counts as a failed recovery.

### PluginAPI Extension

The current `PluginAPI` interface in `src/hooks/index.ts` lacks `runtime`. The implementation must extend it:
```typescript
interface PluginAPI {
  // ... existing fields
  runtime: PluginRuntime;  // Needed for subagent.run() and channel APIs
}
```
This aligns with the full `OpenClawPluginApi` type from the SDK.

### Idempotency

Key format: `clawlens-recovery-{spanId}-{attemptNumber}`

Prevents duplicate wakes during rapid gateway restarts (same pattern as the standalone watchdog).

### Safety Rails

- **Off by default** — must set `recovery.enabled: true`
- **Per-agent exclusion** — `recovery.excludeAgents: [agentId]`
- **Max retry cap** — default 2, prevents infinite recovery loops
- **Cooldown** — 5min between attempts per session
- **Always alerts** — even on successful recovery, user has visibility

## Configuration

Added to `clawlens.config.yaml`:

```yaml
watchdog:
  enabled: true
  staleThresholdMs: 300000       # 5 minutes before marking stalled
  sweepIntervalMs: 60000         # 60 second sweep interval

  alerts:
    enabled: true
    channels:
      - type: webhook
        url: "https://hooks.slack.com/services/T.../B.../xxx"
    cooldownMs: 300000            # 5 min cooldown per session
    onStalled: true
    onFailed: true
    onCrashed: true

  recovery:
    enabled: false                # Opt-in
    maxRetries: 2
    retryCooldownMs: 300000       # 5 min between attempts
    wakeMessage: "Your previous session appears to have stalled. Please review your progress and continue or confirm completion."
    excludeAgents: []
```

**Config loader changes:** The current `loadYamlConfig()` in `src/config.ts` only maps flat top-level fields. The nested `watchdog` block requires extending the loader to parse nested objects. A new `WatchdogConfig` interface will be added to `ClawLensConfig`, and the YAML parser will be updated to handle the nested structure.

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/clawlens/api/health/summary` | Active issue count, recovery stats (24h) |
| GET | `/clawlens/api/health/issues` | Paginated list of flagged sessions |
| POST | `/clawlens/api/health/recover/:sessionId` | Manually trigger recovery |
| POST | `/clawlens/api/health/dismiss/:sessionId` | Dismiss an issue |

### Response Types

```typescript
interface HealthSummary {
  activeStalls: number;
  failedSessions24h: number;
  recoveryAttempts24h: number;
  recoverySuccessRate: number;  // 0-1
}

interface HealthIssue {
  sessionId: string;
  agentId: string;
  state: 'stalled' | 'failed' | 'crashed';
  detectedAt: number;
  duration: number;
  lastActivity: number;
  errorMessage?: string;
  recoveryAttempts: number;
  recoveryStatus: string;
}
```

## UI — Health Dashboard

### New Page: `/clawlens/health`

**Alert strip** (reusable component, shown on all pages):
- Red banner when active stalls/crashes exist
- Yellow for recent failures
- Shows count + link to Health page

**Summary cards** (top row):
- Active Stalls | Failed (24h) | Recovery Attempts | Recovery Success Rate

**Issue table** (main content):
- Columns: Agent | Session | State | Duration | Last Activity | Recovery Status | Actions
- State shown as colored badge (red=crashed, orange=stalled, yellow=failed)
- Actions: "View Replay" link, "Recover Now" button (if recovery enabled), "Dismiss"
- Sortable by state severity, duration, or time

**Health timeline** (bottom):
- Line/area chart showing health events over time
- Stalls, failures, and recoveries as separate series
- Matches the date range filters from other pages

### Integration with Existing Pages

**Bots page (`Bots.tsx`):**
- Health indicator dot on each agent card (green/yellow/red)
- Tooltip showing active issue count

**Session list (`SessionList.tsx`):**
- "Health" column showing flagged state badge
- Filter option to show only flagged sessions

**Nav sidebar (`Layout.tsx`):**
- "Health" link with badge count for active issues

## New Files

### Backend (`packages/plugin/`)
- `src/watchdog/types.ts` — WatchdogIssue, HealthState, config types
- `src/watchdog/detector.ts` — Detection queries + sweep scheduler
- `src/watchdog/alerter.ts` — Channel notification with cooldown
- `src/watchdog/recovery.ts` — Subagent wake with retry logic
- `src/watchdog/index.ts` — Hook registration, initialization
- `src/api/health.ts` — Health API endpoints

### Frontend (`packages/ui/`)
- `src/pages/Health.tsx` — Health dashboard page
- `src/components/AlertStrip.tsx` — Reusable alert banner
- `src/components/HealthBadge.tsx` — Status badge component
- `src/hooks/useHealth.ts` — Health API data fetching
- `src/api/client.ts` — Add health endpoint types

### Modified Files
- `packages/plugin/src/index.ts` — Initialize watchdog module
- `packages/plugin/src/config.ts` — Add watchdog config schema
- `packages/ui/src/components/Layout.tsx` — Add Health nav link + badge
- `packages/ui/src/pages/Bots.tsx` — Add health indicator to agent cards
- `packages/ui/src/pages/SessionList.tsx` — Add health column

## Verification

1. **Detection test:** Start an agent session, kill it mid-task. Confirm the sweep detects it as stalled within 60s.
2. **Alert test:** Configure a Slack/Discord channel. Trigger a stall. Confirm notification arrives with session link.
3. **Recovery test:** Enable recovery, trigger a stall. Confirm wake message is sent via subagent.run() and session resumes.
4. **UI test:** Open `/clawlens/health`. Confirm issues appear in table. Click "View Replay" — confirm it navigates correctly. Click "Recover Now" — confirm recovery triggers.
5. **Alert strip test:** Navigate to Bots/Sessions pages. Confirm red banner appears when active issues exist.
6. **Gateway restart test:** Kill gateway while sessions are open. Restart. Confirm orphaned sessions are detected and flagged.
7. **Cooldown test:** Trigger multiple stalls rapidly. Confirm alerts respect cooldown (no spam).
8. **Build test:** Run `pnpm --filter @clawlens/plugin build` and `pnpm --filter @clawlens/ui build` — confirm no errors.
