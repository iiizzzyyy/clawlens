/**
 * Core type definitions for ClawLens spans
 *
 * Based on schema validation against OpenClaw 2026.3 hook contexts and JSONL format.
 */

export type SpanType = 'session' | 'turn' | 'llm_call' | 'tool_exec' | 'memory_search' | 'delegation';

export type SpanStatus = 'ok' | 'error' | 'timeout' | 'cancelled';

export type SpanSource = 'hook' | 'jsonl' | 'derived';

/**
 * Core span structure
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
  durationMs: number | null; // Computed

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

  // Source
  source: SpanSource;

  // Type-specific metadata (stored as JSON)
  metadata: Record<string, any>;

  // Timestamps
  createdAt: number;
}

/**
 * Span metadata by type
 */
export interface SessionMetadata {
  userId?: string;
  senderName?: string;
  senderUsername?: string;
  isGroup?: boolean;
  groupId?: string;
  stopReason?: string;
}

export interface TurnMetadata {
  userMessagePreview?: string;
  assistantMessagePreview?: string;
  toolCallCount?: number;
  hasThinking?: boolean;
}

export interface LlmCallMetadata {
  requestId?: string;
  hasThinking?: boolean;
  thinkingTokens?: number;
}

export interface ToolExecMetadata {
  toolName: string;
  toolArgsPreview?: string;
  toolResultPreview?: string;
  toolCallId?: string;
}

export interface MemorySearchMetadata {
  query?: string;
  resultsCount?: number;
  searchType?: string;
}

export interface DelegationMetadata {
  targetAgentId?: string;
  childSessionId?: string;
  delegationType?: string;
}

/**
 * Daily aggregated statistics
 */
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

/**
 * Import tracking record
 */
export interface ImportRecord {
  filePath: string;
  fileHash: string;
  importedAt: number;
  spansCreated: number;
}
