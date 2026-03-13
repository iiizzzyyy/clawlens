# ClawLens Roadmap

This document outlines the current status and future direction of ClawLens development.

---

## V1 — Core Investigation Features (Current)

### Status: ✅ Complete

V1 delivers the three core capabilities that make ClawLens worth installing:

#### ✅ Session Replay

- [x] Turn-by-turn vertical timeline
- [x] Tool execution waterfall per turn
- [x] Running cost accumulator
- [x] Drill into LLM calls and tool executions
- [x] Click delegations to follow sub-agent sessions
- [x] URL-addressable sessions (`/clawlens/replay/:sessionId`)

#### ✅ Cross-Session Analytics

Pre-built analytics queries:

- [x] Cost by model
- [x] Cost by agent
- [x] Cost by channel
- [x] Errors by tool
- [x] Latency by span type
- [x] Sessions over time
- [x] Token usage
- [x] Cost by agent + model
- [x] Cost per successful task
- [x] Tool failure rate
- [x] Retry clustering
- [x] Latency percentiles
- [x] Session duration distribution
- [x] Error hotspots by channel
- [x] Token waste (context re-reads)

#### ✅ Agent Topology

- [x] Force-directed graph visualization
- [x] Nodes = agents (sized by cost or span count)
- [x] Edges = delegations (colored by status)
- [x] Click nodes to jump to agent's sessions
- [x] Click edges to see delegation details

#### ✅ Plugin Infrastructure

- [x] OpenClaw plugin integration
- [x] SQLite storage with WAL mode
- [x] JSONL session backfill importer
- [x] Configuration via YAML file
- [x] Demo mode with sample sessions
- [x] Data retention policy
- [x] HTTP API with typed responses
- [x] React SPA served as static assets

#### ✅ Developer Experience

- [x] Comprehensive test suite (200+ tests)
- [x] CI/CD pipeline (GitHub Actions)
- [x] Documentation (architecture, schema, contributing)
- [x] TypeScript types throughout
- [x] One-command dev setup (`pnpm install && pnpm dev`)

---

## V2 — Community-Driven Enhancements

V2 features will be prioritized based on **real user feedback** and **adoption metrics**. The features below are candidates, not commitments.

### Governance

- Features ship **only after demonstrated user demand**
- Prioritization via GitHub Discussions voting
- RFC process for major features
- Community contributors welcome for all features

---

## V2 Feature Candidates

### 🔧 CLI Companion

**Trigger**: Power users requesting headless access

**Description**: Terminal-based interface for ClawLens queries and replay.

**Commands**:
- `clawlens replay <session-id>` — Terminal session replay
- `clawlens query <query-type>` — Run analytics queries from CLI
- `clawlens export <session-id> --format json|html|pdf` — Export sessions
- `clawlens import <path>` — Import JSONL sessions
- `clawlens stats` — Summary statistics
- `clawlens prune --days 30` — Manual data pruning

**Benefits**:
- CI/CD integration for testing
- Scripting and automation
- Headless server deployments

**Effort**: Medium (2-3 weeks)

---

### 🗄️ Postgres Mode

**Trigger**: Users hitting SQLite concurrency limits or wanting team-wide deployments

**Description**: Optional Postgres backend for team/high-volume deployments.

**Features**:
- Same schema, different database engine
- Config option: `db_backend: postgres`
- Connection pooling for concurrent sessions
- Multi-workspace support (shared database)

**Benefits**:
- Better concurrency for high-traffic agents
- Centralized ClawLens for entire team
- Query performance at scale

**Effort**: Medium (2-3 weeks)

**Migration**: Automatic schema migration from SQLite to Postgres

---

### 💰 Cost Budgets & Alerts

**Trigger**: Teams needing spend governance

**Description**: Per-agent, per-channel, and per-user cost budgets with real-time alerts.

**Features**:
- Set daily/weekly/monthly budgets
- Alert when budget exceeded (80%, 100%, 120%)
- Agent auto-pause when hard limit hit
- Budget tracking dashboard in UI
- Slack/Discord/Email notifications

**Config**:
```yaml
clawlens:
  budgets:
    - agent_id: customer-support
      daily_limit_usd: 50.0
      alert_threshold: 0.8
    - channel: telegram
      monthly_limit_usd: 1000.0
```

**Effort**: Medium (3-4 weeks)

---

### 📊 Semantic Drift Detection

**Trigger**: Power users with cron-heavy workflows needing quality regression detection

**Description**: Track agent output quality over time and alert on regressions.

**Features**:
- Baseline agent outputs for common queries
- Semantic similarity scoring (embedding-based)
- Drift detection: alert when output diverges from baseline
- Quality regression dashboard
- Integration with A/B testing

**Use Cases**:
- Detect when prompt changes degrade quality
- Monitor cron jobs for unexpected behavior
- Track agent consistency over time

**Effort**: Large (4-6 weeks)

---

### 🔔 Slack/Discord Notifications

**Trigger**: Team ops workflows

**Description**: Real-time notifications to team channels for important events.

**Alerts**:
- Cost spike detected
- Error cluster detected (5+ errors in 10 minutes)
- Agent stale (no activity in 24h)
- Budget exceeded
- Session timeout

**Config**:
```yaml
clawlens:
  notifications:
    slack:
      webhook_url: https://hooks.slack.com/...
      channels:
        - "#agent-alerts"
      events:
        - cost_spike
        - error_cluster
    discord:
      webhook_url: https://discord.com/api/webhooks/...
```

**Effort**: Small (1-2 weeks)

---

### 🔗 OTEL Span Import

**Trigger**: Users with existing OTEL pipelines

**Description**: Ingest OpenTelemetry spans directly into ClawLens.

**Features**:
- OTEL collector integration
- Automatic span type mapping
- Preserve OTEL trace context
- Bidirectional: OTEL → ClawLens and ClawLens → OTEL

**Benefits**:
- No duplicate instrumentation
- Leverage existing OTEL infra
- Unified trace storage

**Effort**: Large (4-6 weeks)

---

### 🔀 Diff View

**Trigger**: Debugging regressions

**Description**: Compare two sessions side-by-side.

**Features**:
- Side-by-side session replay
- Highlight differences in:
  - Cost
  - Tool calls
  - Outputs
  - Timing
- Semantic diff (embedding-based similarity)
- "What changed?" summary

**Use Cases**:
- Debug regressions after prompt changes
- Compare agent behavior before/after updates
- A/B test analysis

**Effort**: Medium (3-4 weeks)

---

### 📤 Export & Share

**Trigger**: Bug reporting workflows

**Description**: Export session replay as shareable HTML or PDF.

**Features**:
- Self-contained HTML export (no server needed)
- PDF export with full timeline
- Redact sensitive data before sharing
- Embed in Notion/Confluence/GitHub issues

**Formats**:
- HTML (interactive, standalone)
- PDF (static, printable)
- JSON (machine-readable)

**Effort**: Small (1-2 weeks)

---

### 🛠️ Plugin Marketplace

**Trigger**: Contributor ecosystem growth

**Description**: Custom analytics query plugins and custom visualizations.

**Features**:
- Plugin API for custom queries
- Plugin API for custom UI components
- Plugin registry (npm packages)
- One-click install from UI

**Example Plugins**:
- `@clawlens-plugins/custom-charts` — Additional chart types
- `@clawlens-plugins/slack-integration` — Deeper Slack integration
- `@clawlens-plugins/openai-analyzer` — OpenAI-specific cost analysis

**Effort**: Large (6-8 weeks)

---

## Prioritization Criteria

Features are evaluated on:

1. **User demand**: How many users requested it?
2. **Impact**: How much value does it provide?
3. **Effort**: How long will it take to build?
4. **Maintenance**: What's the ongoing support cost?
5. **Alignment**: Does it fit ClawLens's core mission?

**Core mission**: _ClawLens is an investigation tool, not a monitoring dashboard._

Features that move ClawLens toward "monitoring" will be deprioritized in favor of "investigation."

---

## How to Influence the Roadmap

1. **Vote on features**: Use GitHub Discussions to upvote features
2. **Share use cases**: Describe your problem, not your solution
3. **Contribute**: Submit PRs for features you want
4. **Sponsor**: Fund development of specific features

---

## Declined Features

These features have been considered and **will not** be added to ClawLens:

| Feature | Reason |
|---------|--------|
| Real-time alerting system | ClawMetry and OTEL already do this well |
| Hosted cloud product | ClawLens is local-first by design |
| Full OTEL replacement | ClawLens consumes OTEL, doesn't replace it |
| Agent performance benchmarking | Better suited for separate tool |
| LLM provider integrations | ClawLens is provider-agnostic |

---

## Release Schedule

- **V1**: ✅ Complete (beta released)
- **V2.0**: Q2 2026 (first V2 feature based on feedback)
- **V2.1+**: Every 6-8 weeks

---

## Contributing to V2

Want to help build V2 features?

1. **Check GitHub Discussions** for feature proposals
2. **Comment with your use case** on features you care about
3. **Submit an RFC** for new feature ideas
4. **Contribute code** for features you want to see

See [Contributing Guide](contributing-guide.md) for development setup.

---

## Questions?

- **GitHub Discussions**: Ask about roadmap direction
- **GitHub Issues**: Report bugs or request features
- **Discord**: Join the OpenClaw community (ClawLens channel)

---

_Last updated: March 2026_
