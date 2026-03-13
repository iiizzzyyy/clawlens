# ClawLens

> **The investigation layer for OpenClaw** — understand _why_ your agents behave the way they do

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/clawlens/clawlens/ci.yml?branch=main)](https://github.com/clawlens/clawlens/actions)
[![npm](https://img.shields.io/npm/v/@clawlens/plugin)](https://www.npmjs.com/package/@clawlens/plugin)

---

## What is ClawLens?

ClawLens is an **investigation and debugging tool** for OpenClaw — purpose-built to answer "why did my agent do that?" rather than just "what happened?" It captures every session, turn, LLM call, and tool execution, then lets you **replay conversations turn-by-turn**, **query patterns across sessions**, and **visualize multi-agent delegation flows**. Unlike monitoring dashboards that show metrics, ClawLens shows you the _why_ behind cost spikes, failures, and unexpected behavior.

---

## Quick Start

```bash
# 1. Install the plugin
npm install @clawlens/plugin

# 2. Start OpenClaw with the plugin enabled
openclaw --plugins @clawlens/plugin

# 3. Open the ClawLens UI
open http://localhost:PORT/clawlens
```

That's it. ClawLens automatically captures sessions from now on and backfills your existing session history.

---

## Features

### 🔍 **Session Replay**

Step through any agent conversation turn-by-turn with full cost, token, tool execution, and timing annotations. See exactly where your agent went wrong.

![Session Replay Screenshot](docs/screenshots/session-replay.png)
<!-- TODO: Add actual screenshot -->

- Turn-by-turn vertical timeline
- Tool execution waterfall per turn
- Running cost accumulator
- Drill into any LLM call or tool execution
- Click delegations to follow sub-agent sessions

### 📊 **Cross-Session Analytics**

Answer investigative questions that cut across sessions:

- **Cost by agent/model** — "Which combination is burning money?"
- **Cost per successful task** — "Am I paying more for worse results?"
- **Tool failure rate** — "Which tool is the most unreliable?"
- **Retry clustering** — "Where do retries concentrate?"
- **Latency percentiles** — "Is my bottleneck LLM inference or tool execution?"
- **Token waste** — "How much am I spending on re-reading history?"

![Analytics Screenshot](docs/screenshots/analytics.png)
<!-- TODO: Add actual screenshot -->

### 🕸️ **Agent Topology**

Visualize multi-agent delegation graphs at runtime. See which agents spawned which, where timeouts occurred, and where cost concentrated across the network.

![Topology Screenshot](docs/screenshots/topology.png)
<!-- TODO: Add actual screenshot -->

---

## How It Works

ClawLens runs as an **OpenClaw plugin** inside the Gateway process. No separate services, no Docker, no orchestration.

```
┌──────────────────────────────────────────────┐
│           OpenClaw Gateway                   │
│                                              │
│  ┌─────────┐   ┌──────┐   ┌─────────────┐   │
│  │ Channel │──▶│Agent │──▶│Tools (bash, │   │
│  │Adapters │   │Runtime│   │browser, etc)│   │
│  └─────────┘   └──┬───┘   └─────────────┘   │
│                   │                          │
│              ┌────▼────┐                     │
│              │Lifecycle│                     │
│              │  Hooks  │                     │
│              └────┬────┘                     │
│                   ▼                          │
│  ┌─────────────────────────────────────┐    │
│  │       ClawLens Plugin                │    │
│  │  ┌────────┐  ┌─────┐  ┌──────────┐  │    │
│  │  │Capture │──▶│Query│──▶│  Web UI  │  │    │
│  │  └───┬────┘  └─────┘  └──────────┘  │    │
│  │      ▼                               │    │
│  │  ┌────────┐  ┌──────────┐           │    │
│  │  │SQLite  │  │  JSONL   │           │    │
│  │  │(spans) │  │ Importer │           │    │
│  │  └────────┘  └──────────┘           │    │
│  └─────────────────────────────────────┘    │
└──────────────────────────────────────────────┘
```

**Live capture**: Lifecycle hooks write spans to SQLite (WAL mode) in real-time
**Historical backfill**: Existing JSONL session files are imported on first startup
**Web UI**: Static React app served at `/clawlens` with live polling

---

## Configuration

Create `clawlens.config.yaml` in your OpenClaw workspace root:

```yaml
clawlens:
  enabled: true
  db_path: ~/.openclaw/clawlens/clawlens.db
  retention_days: 90
  backfill_on_start: true
  cost_alert_threshold_usd: 10.0
  exclude_agents: []
  exclude_channels: []
  verbose: false
```

### Configuration Options

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable the plugin |
| `db_path` | string | `~/.openclaw/clawlens/clawlens.db` | SQLite database location |
| `retention_days` | number | `90` | Auto-prune spans older than N days |
| `backfill_on_start` | boolean | `true` | Import existing JSONL sessions on startup |
| `sessions_dir` | string | `~/.openclaw/agents` | Directory containing JSONL sessions |
| `cost_alert_threshold_usd` | number | `10.0` | Log warning if session exceeds this cost |
| `exclude_agents` | string[] | `[]` | Agent IDs to skip capturing |
| `exclude_channels` | string[] | `[]` | Channels to skip capturing |
| `verbose` | boolean | `false` | Enable verbose logging |
| `demo` | boolean | `false` | Auto-load demo sessions for exploration |

---

## Documentation

- [Architecture Guide](docs/architecture.md) — How ClawLens works under the hood
- [Event Schema](docs/event-schema.md) — Span types and field reference
- [Contributing Guide](docs/contributing-guide.md) — How to add features and fix bugs
- [Roadmap](docs/roadmap.md) — V2 features and community priorities

---

## Contributing

We welcome contributions! ClawLens is designed for community extension from day one.

- **Quick dev setup**: `pnpm install && pnpm dev`
- **Run tests**: `pnpm test`
- **Add a query**: See [Contributing Guide](docs/contributing-guide.md#adding-analytics-queries)
- **Report bugs**: Use the [issue tracker](https://github.com/clawlens/clawlens/issues)

See [CONTRIBUTING.md](CONTRIBUTING.md) for full details.

---

## Why ClawLens?

OpenClaw has great OTEL metrics and ClawMetry for cost tracking, but when something goes wrong, you're left **grep-ing JSONL files** or **staring at aggregate metrics**. ClawLens fills the gap:

| Capability | ClawLens | ClawMetry | Raw OTEL | JSONL Files |
|-----------|----------|-----------|----------|-------------|
| Session replay with cost annotation | ✅ | ❌ | ❌ | Manual |
| Cross-session investigative queries | ✅ | Partial | ❌ | ❌ |
| Agent topology visualization | ✅ | ❌ | ❌ | ❌ |
| Tool execution waterfall | ✅ | ❌ | Partial | ❌ |
| Works without OTEL enabled | ✅ | ❌ | ❌ | ✅ |
| Historical backfill | ✅ | ❌ | ❌ | N/A |
| Zero-config install | ✅ | ✅ | ❌ | N/A |

**ClawLens shows you the exact session where the agent entered a retry loop, re-read 47KB of context six times, and burned $12 on a task that should have cost $0.80.**

---

## License

Apache-2.0 — see [LICENSE](LICENSE)

---

## Acknowledgments

Built for the OpenClaw community. Special thanks to the plugin SDK maintainers for making plugin-native observability possible.
