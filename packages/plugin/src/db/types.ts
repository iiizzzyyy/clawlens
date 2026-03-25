/**
 * Database type definitions for ClawLens
 *
 * These types match the SQLite schema exactly for consistent data handling.
 */

// =============================================================================
// Span Types
// =============================================================================

export type SpanType =
  | 'session'
  | 'turn'
  | 'llm_call'
  | 'tool_exec'
  | 'memory_search'
  | 'delegation';

export type SpanStatus = 'ok' | 'error' | 'timeout' | 'cancelled';

export type SpanSource = 'hook' | 'jsonl' | 'derived';

/**
 * Core span structure matching SQLite schema
 */
export interface Span {
  // Identity
  id: string;
  traceId: string;
  parentId: string | null;

  // OpenClaw identifiers
  sessionId: string;
  sessionKey: string | null;
  agentId: string;

  // Context
  channel: string | null;
  accountId: string | null;
  conversationId: string | null;

  // Classification
  spanType: SpanType;
  name: string;

  // Timing
  startTs: number; // Unix ms
  endTs: number | null;
  durationMs: number | null; // Computed by SQLite

  // Cost & Tokens
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  costInputUsd: number;
  costOutputUsd: number;
  model: string | null;
  provider: string | null;

  // Outcome
  status: SpanStatus;
  errorMessage: string | null;

  // Execution context
  runId: string | null;
  sequenceNum: number | null;

  // Source tracking
  source: SpanSource;

  // Flexible payload (stored as JSON string in DB)
  metadata: Record<string, unknown>;

  // Timestamps
  createdAt: number;
}

/**
 * Row representation as stored in SQLite (snake_case, JSON string metadata)
 */
export interface SpanRow {
  id: string;
  trace_id: string;
  parent_id: string | null;
  session_id: string;
  session_key: string | null;
  agent_id: string;
  channel: string | null;
  account_id: string | null;
  conversation_id: string | null;
  span_type: string;
  name: string;
  start_ts: number;
  end_ts: number | null;
  duration_ms: number | null;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  cost_input_usd: number;
  cost_output_usd: number;
  model: string | null;
  provider: string | null;
  status: string;
  error_message: string | null;
  run_id: string | null;
  sequence_num: number | null;
  source: string;
  metadata: string;
  created_at: number;
}

// =============================================================================
// Session Summary (for list view)
// =============================================================================

export interface SessionSummary {
  sessionId: string;
  agentId: string;
  channel: string | null;
  startTs: number;
  endTs: number | null;
  durationMs: number | null;
  totalCost: number;
  totalTokensIn: number;
  totalTokensOut: number;
  spanCount: number;
  errorCount: number;
  toolCalls: number;
  status: SpanStatus;
}

// =============================================================================
// Analytics Types
// =============================================================================

export interface AnalyticsParams {
  fromTs?: number;
  toTs?: number;
  agentId?: string;
  channel?: string;
  model?: string;
  groupBy?: string;
  limit?: number;
}

export interface AnalyticsResult {
  queryType: string;
  data: any[]; // Can be AnalyticsDataPoint[] or custom query result types
  metadata: {
    fromTs?: number;
    toTs?: number;
    totalRecords?: number;
  };
}

export interface AnalyticsDataPoint {
  label: string;
  value: number;
  count?: number;
  metadata?: Record<string, unknown>;
}

// =============================================================================
// Topology Types
// =============================================================================

export interface TopologyNode {
  id: string; // agent_id
  label: string;
  spanCount: number;
  totalCost: number;
  errorCount: number;
}

export interface TopologyEdge {
  source: string; // parent agent_id
  target: string; // child agent_id
  count: number;
  status: 'ok' | 'mixed' | 'error';
}

export interface TopologyGraph {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  metadata: {
    fromTs?: number;
    toTs?: number;
  };
}

// =============================================================================
// Daily Stats
// =============================================================================

export interface DailyStats {
  date: string; // YYYY-MM-DD
  agentId: string;
  channel: string | null;
  model: string | null;
  totalSpans: number;
  totalErrors: number;
  totalCost: number;
  totalTokens: number;
  avgDuration: number;
}

export interface DailyStatsRow {
  date: string;
  agent_id: string;
  channel: string | null;
  model: string | null;
  total_spans: number;
  total_errors: number;
  total_cost: number;
  total_tokens: number;
  avg_duration: number;
}

// =============================================================================
// Import Tracking
// =============================================================================

export interface ImportRecord {
  filePath: string;
  fileHash: string;
  importedAt: number;
  spansCreated: number;
}

export interface ImportRecordRow {
  file_path: string;
  file_hash: string;
  imported_at: number;
  spans_created: number;
}

// =============================================================================
// Query Filters
// =============================================================================

export interface SessionListFilters {
  agentId?: string;
  channel?: string;
  status?: SpanStatus;
  fromTs?: number;
  toTs?: number;
  limit?: number;
  offset?: number;
}

// =============================================================================
// Conversion Utilities
// =============================================================================

/**
 * Convert a database row to a Span object
 */
export function rowToSpan(row: SpanRow): Span {
  return {
    id: row.id,
    traceId: row.trace_id,
    parentId: row.parent_id,
    sessionId: row.session_id,
    sessionKey: row.session_key,
    agentId: row.agent_id,
    channel: row.channel,
    accountId: row.account_id,
    conversationId: row.conversation_id,
    spanType: row.span_type as SpanType,
    name: row.name,
    startTs: row.start_ts,
    endTs: row.end_ts,
    durationMs: row.duration_ms,
    tokensIn: row.tokens_in,
    tokensOut: row.tokens_out,
    costUsd: row.cost_usd,
    costInputUsd: row.cost_input_usd,
    costOutputUsd: row.cost_output_usd,
    model: row.model,
    provider: row.provider,
    status: row.status as SpanStatus,
    errorMessage: row.error_message,
    runId: row.run_id,
    sequenceNum: row.sequence_num,
    source: row.source as SpanSource,
    metadata: JSON.parse(row.metadata || '{}'),
    createdAt: row.created_at,
  };
}

/**
 * Convert a Span object to database row format
 */
export function spanToRow(span: Span): Omit<SpanRow, 'duration_ms'> {
  return {
    id: span.id,
    trace_id: span.traceId,
    parent_id: span.parentId,
    session_id: span.sessionId,
    session_key: span.sessionKey,
    agent_id: span.agentId,
    channel: span.channel,
    account_id: span.accountId,
    conversation_id: span.conversationId,
    span_type: span.spanType,
    name: span.name,
    start_ts: span.startTs,
    end_ts: span.endTs,
    tokens_in: span.tokensIn,
    tokens_out: span.tokensOut,
    cost_usd: span.costUsd,
    cost_input_usd: span.costInputUsd,
    cost_output_usd: span.costOutputUsd,
    model: span.model,
    provider: span.provider,
    status: span.status,
    error_message: span.errorMessage,
    run_id: span.runId,
    sequence_num: span.sequenceNum,
    source: span.source,
    metadata: JSON.stringify(span.metadata),
    created_at: span.createdAt,
  };
}

/**
 * Convert DailyStatsRow to DailyStats
 */
export function rowToDailyStats(row: DailyStatsRow): DailyStats {
  return {
    date: row.date,
    agentId: row.agent_id,
    channel: row.channel,
    model: row.model,
    totalSpans: row.total_spans,
    totalErrors: row.total_errors,
    totalCost: row.total_cost,
    totalTokens: row.total_tokens,
    avgDuration: row.avg_duration,
  };
}
