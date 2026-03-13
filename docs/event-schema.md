# ClawLens Event Schema

This document defines the structure of spans captured by ClawLens.

---

## Overview

Every observable event in OpenClaw is captured as a **span** — a unit of work with a start time, end time, and typed metadata. Spans form trees via parent references, enabling drill-down from session to turn to individual tool call.

---

## Core Span Structure

All spans share these fields:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique span identifier (UUID) |
| `traceId` | string | Groups all spans in one session |
| `parentId` | string \| null | Parent span ID (null for root) |
| `sessionId` | string | OpenClaw session ID |
| `sessionKey` | string \| null | Session key for multi-session agents |
| `agentId` | string | Agent identifier |
| `channel` | string \| null | Channel name (telegram, slack, discord, etc.) |
| `accountId` | string \| null | Account/user identifier |
| `conversationId` | string \| null | Conversation thread ID |
| `spanType` | SpanType | Type of span (see below) |
| `name` | string | Human-readable label |
| `startTs` | number | Start timestamp (Unix ms) |
| `endTs` | number \| null | End timestamp (null if in-progress) |
| `durationMs` | number \| null | Computed: `endTs - startTs` |
| `tokensIn` | number | Input tokens consumed |
| `tokensOut` | number | Output tokens generated |
| `costUsd` | number | Total cost in USD |
| `costInputUsd` | number | Input token cost in USD |
| `costOutputUsd` | number | Output token cost in USD |
| `model` | string \| null | Model identifier (e.g., `claude-sonnet-4`) |
| `provider` | string \| null | Provider name (e.g., `anthropic`) |
| `status` | SpanStatus | Outcome: `ok` \| `error` \| `timeout` \| `cancelled` |
| `errorMessage` | string \| null | Error description if status != ok |
| `runId` | string \| null | Run identifier from hooks |
| `sequenceNum` | number \| null | Sequence number within run |
| `source` | SpanSource | Data source: `hook` \| `jsonl` \| `derived` |
| `metadata` | object | Span-type-specific metadata (see below) |
| `createdAt` | number | Creation timestamp (Unix ms) |

---

## Span Types

### `session`

**Description**: Root span representing an entire agent session.

**Parent**: None (root span)

**Duration**: From session start to session end

**Metadata Fields**:

| Field | Type | Description |
|-------|------|-------------|
| `userId` | string | User identifier |
| `device` | string | Device type (web, mobile, etc.) |
| `initialMessage` | string | First user message (preview) |
| `platform` | string | Platform information |

**Example**:

```json
{
  "id": "sess_abc123",
  "traceId": "sess_abc123",
  "parentId": null,
  "sessionId": "sess_abc123",
  "agentId": "customer-support",
  "channel": "telegram",
  "spanType": "session",
  "name": "Customer Support Session",
  "startTs": 1709856000000,
  "endTs": 1709856245000,
  "durationMs": 245000,
  "totalCost": 0.024,
  "status": "ok",
  "metadata": {
    "userId": "user_123",
    "device": "mobile",
    "initialMessage": "I need help with my order"
  }
}
```

---

### `turn`

**Description**: One user message + agent response cycle.

**Parent**: `session` span

**Duration**: From message received to response sent

**Metadata Fields**:

| Field | Type | Description |
|-------|------|-------------|
| `userMessagePreview` | string | First 200 chars of user message |
| `assistantMessagePreview` | string | First 200 chars of agent response |
| `toolCalls` | number | Number of tool calls in this turn |
| `retryCount` | number | Number of retries if any |

**Example**:

```json
{
  "id": "turn_001",
  "traceId": "sess_abc123",
  "parentId": "sess_abc123",
  "sessionId": "sess_abc123",
  "agentId": "customer-support",
  "spanType": "turn",
  "name": "Turn 1",
  "startTs": 1709856001000,
  "endTs": 1709856015000,
  "durationMs": 14000,
  "tokensIn": 1200,
  "tokensOut": 450,
  "costUsd": 0.012,
  "status": "ok",
  "metadata": {
    "userMessagePreview": "I need help with my order #12345",
    "assistantMessagePreview": "I'd be happy to help you with order #12345...",
    "toolCalls": 2
  }
}
```

---

### `llm_call`

**Description**: Single LLM inference call.

**Parent**: `turn` span

**Duration**: From request sent to response received

**Metadata Fields**:

| Field | Type | Description |
|-------|------|-------------|
| `prompt` | string | Prompt text (preview) |
| `completion` | string | Completion text (preview) |
| `cachedTokens` | number | Tokens served from cache |
| `temperature` | number | Sampling temperature |
| `maxTokens` | number | Max tokens requested |
| `stopReason` | string | Why generation stopped |

**Example**:

```json
{
  "id": "llm_001",
  "traceId": "sess_abc123",
  "parentId": "turn_001",
  "sessionId": "sess_abc123",
  "agentId": "customer-support",
  "spanType": "llm_call",
  "name": "Claude Sonnet 4 Call",
  "startTs": 1709856002000,
  "endTs": 1709856008000,
  "durationMs": 6000,
  "tokensIn": 1200,
  "tokensOut": 450,
  "costUsd": 0.009,
  "model": "claude-sonnet-4",
  "provider": "anthropic",
  "status": "ok",
  "metadata": {
    "cachedTokens": 800,
    "temperature": 0.7,
    "maxTokens": 1024,
    "stopReason": "end_turn"
  }
}
```

---

### `tool_exec`

**Description**: Tool execution (bash, browser, API call, etc.).

**Parent**: `turn` span

**Duration**: From tool invocation to result returned

**Metadata Fields**:

| Field | Type | Description |
|-------|------|-------------|
| `toolName` | string | Tool identifier |
| `toolArgsPreview` | string | Tool arguments (truncated) |
| `toolResultPreview` | string | Tool result (truncated) |
| `exitCode` | number | Process exit code (for bash) |
| `stdout` | string | Standard output (preview) |
| `stderr` | string | Standard error (preview) |

**Example**:

```json
{
  "id": "tool_001",
  "traceId": "sess_abc123",
  "parentId": "turn_001",
  "sessionId": "sess_abc123",
  "agentId": "customer-support",
  "spanType": "tool_exec",
  "name": "database_query",
  "startTs": 1709856009000,
  "endTs": 1709856012000,
  "durationMs": 3000,
  "status": "ok",
  "metadata": {
    "toolName": "database_query",
    "toolArgsPreview": "{\"query\": \"SELECT * FROM orders WHERE id = '12345'\"}",
    "toolResultPreview": "{\"id\": \"12345\", \"status\": \"shipped\", ...}",
    "exitCode": 0
  }
}
```

---

### `memory_search`

**Description**: Memory recall operation (vector search, BM25, etc.).

**Parent**: `turn` span

**Duration**: From query start to results returned

**Metadata Fields**:

| Field | Type | Description |
|-------|------|-------------|
| `query` | string | Search query text |
| `resultsCount` | number | Number of results returned |
| `searchType` | string | Search method (vector, bm25, hybrid) |
| `topScore` | number | Highest relevance score |
| `namespace` | string | Memory namespace searched |

**Example**:

```json
{
  "id": "mem_001",
  "traceId": "sess_abc123",
  "parentId": "turn_001",
  "sessionId": "sess_abc123",
  "agentId": "customer-support",
  "spanType": "memory_search",
  "name": "Memory Search: order history",
  "startTs": 1709856001500,
  "endTs": 1709856001800,
  "durationMs": 300,
  "status": "ok",
  "metadata": {
    "query": "order #12345 history",
    "resultsCount": 5,
    "searchType": "hybrid",
    "topScore": 0.92,
    "namespace": "order-history"
  }
}
```

---

### `delegation`

**Description**: Agent-to-agent delegation.

**Parent**: `turn` span (of parent agent)

**Duration**: From delegation start to sub-agent completion

**Metadata Fields**:

| Field | Type | Description |
|-------|------|-------------|
| `targetAgentId` | string | Target agent identifier |
| `delegationType` | string | Type: `agent-send` \| `session-spawn` |
| `timeoutMs` | number | Timeout value |
| `subSessionId` | string | Sub-session ID created |
| `delegationReason` | string | Why delegation occurred |

**Example**:

```json
{
  "id": "deleg_001",
  "traceId": "sess_abc123",
  "parentId": "turn_002",
  "sessionId": "sess_abc123",
  "agentId": "coordinator",
  "spanType": "delegation",
  "name": "Delegate to specialist",
  "startTs": 1709856020000,
  "endTs": 1709856045000,
  "durationMs": 25000,
  "status": "ok",
  "metadata": {
    "targetAgentId": "order-specialist",
    "delegationType": "session-spawn",
    "timeoutMs": 60000,
    "subSessionId": "sess_xyz789",
    "delegationReason": "Complex order inquiry requires specialist"
  }
}
```

---

## Span Status Values

| Status | Description |
|--------|-------------|
| `ok` | Span completed successfully |
| `error` | Span failed with error |
| `timeout` | Span exceeded timeout |
| `cancelled` | Span was cancelled |

---

## Span Source Values

| Source | Description |
|--------|-------------|
| `hook` | Captured via lifecycle hook (real-time) |
| `jsonl` | Imported from JSONL session file (backfill) |
| `derived` | Derived from other spans (computed) |

---

## Hook Event Mapping

OpenClaw lifecycle hooks map to span types as follows:

| Hook Event | Span Type | Notes |
|------------|-----------|-------|
| `session_start` | `session` | Creates root session span |
| `session_end` | `session` | Closes session span, sets endTs |
| `message_received` | `turn` | Creates new turn span |
| `message_sent` | `turn` | Closes turn span with cost/tokens |
| `before_model_resolve` | `llm_call` | Creates LLM call span |
| `after_model_call` | `llm_call` | Closes LLM call span with usage |
| `before_tool_exec` | `tool_exec` | Creates tool execution span |
| `after_tool_exec` | `tool_exec` | Closes tool span with result |
| `memory_search` | `memory_search` | Memory search operation |
| `agent_delegate` | `delegation` | Agent delegation event |

---

## Span Hierarchy Example

```
session (root)
├── turn 1
│   ├── memory_search (recall previous context)
│   ├── llm_call (generate response)
│   └── tool_exec (database query)
├── turn 2
│   ├── llm_call (process query result)
│   └── delegation (forward to specialist)
│       └── [sub-session created]
└── turn 3
    └── llm_call (final response)
```

---

## Working with Spans

### TypeScript Types

All span types are defined in `packages/plugin/src/db/types.ts`:

```typescript
import type { Span, SpanType, SpanStatus, SpanSource } from '@clawlens/plugin';

// Create a span
const span: Span = {
  id: 'span_123',
  traceId: 'sess_abc',
  parentId: null,
  sessionId: 'sess_abc',
  agentId: 'my-agent',
  spanType: 'session',
  name: 'My Session',
  startTs: Date.now(),
  endTs: null,
  // ... other fields
};
```

### Querying Spans

Use `SpanReader` from `@clawlens/plugin`:

```typescript
import { SpanReader } from '@clawlens/plugin';

const reader = new SpanReader(db);

// Get all spans for a session
const spans = reader.getSessionReplay('sess_abc123');

// Get hierarchical span tree
const tree = reader.getSpanTree('sess_abc123');

// Filter by span type
const toolCalls = spans.filter(s => s.spanType === 'tool_exec');
```

---

## Adding Custom Metadata

Span metadata is a JSON object that can contain any span-type-specific data:

```typescript
// Add custom metadata to a tool execution span
writer.startSpan({
  sessionId: 'sess_123',
  agentId: 'my-agent',
  spanType: 'tool_exec',
  name: 'Custom Tool',
  startTs: Date.now(),
  metadata: {
    customField: 'value',
    nestedData: {
      foo: 'bar'
    }
  }
});
```

**Best Practices**:
- Keep metadata under 10KB
- Use snake_case for field names
- Document custom fields in your plugin documentation
- Avoid storing large payloads (use preview/truncate)

---

## References

- [Architecture Guide](architecture.md)
- [Contributing Guide](contributing-guide.md)
- [Database Schema](../packages/plugin/src/db/schema.ts)
- [Type Definitions](../packages/plugin/src/db/types.ts)
