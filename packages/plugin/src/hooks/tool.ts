/**
 * Tool execution hook handlers
 *
 * Captures tool execution events to create 'tool_exec' and 'memory_search' spans.
 */

import { randomUUID } from 'node:crypto';
import type { SpanWriter } from '../db/writer.js';
import type { SpanContext } from './span-context.js';
import { parseAgentIdFromSessionKey } from './session.js';

/**
 * Hook context for after_tool_call
 */
export interface ToolCallContext {
  toolName: string;
  params: Record<string, unknown>;
  result: unknown;
  error?: string;
  durationMs: number;
  sessionKey: string;
  channelId: string;
  conversationId?: string;
  messageId?: string;
  runId: string;
  toolCallCount: number;
  sessionId?: string;
}

/**
 * Memory tool names that should be classified as 'memory_search' spans
 */
const MEMORY_TOOLS = ['memory_search', 'memory_get', 'memory_recall'];

/**
 * Truncate preview text to max length
 */
function truncatePreview(value: unknown, maxLength = 500): string {
  if (value === null || value === undefined) return '';

  let text: string;
  if (typeof value === 'string') {
    text = value;
  } else if (typeof value === 'object') {
    try {
      text = JSON.stringify(value);
    } catch {
      text = String(value);
    }
  } else {
    text = String(value);
  }

  return text.length > maxLength ? text.slice(0, maxLength) + '...' : text;
}

/**
 * Determine if a tool call is a memory operation
 */
export function isMemoryTool(toolName: string): boolean {
  return MEMORY_TOOLS.includes(toolName);
}

/**
 * Parse session ID from session key if not provided
 */
function extractSessionId(ctx: ToolCallContext): string | null {
  if (ctx.sessionId) return ctx.sessionId;

  // Try to parse from sessionKey
  const match = ctx.sessionKey.match(/session:([^:]+)/);
  return match ? match[1] : null;
}

/**
 * Handle after_tool_call hook
 *
 * Creates a 'tool_exec' or 'memory_search' span for each tool execution.
 * Hook context provides excellent coverage: toolName, params, result, durationMs, runId, etc.
 */
export function onAfterToolCall(
  _event: unknown,
  ctx: ToolCallContext,
  writer: SpanWriter,
  spanContext: SpanContext
): void {
  const sessionId = extractSessionId(ctx);
  if (!sessionId) {
    // Can't create span without session ID
    return;
  }

  const agentId = parseAgentIdFromSessionKey(ctx.sessionKey);

  // Determine span type based on tool name
  const spanType = isMemoryTool(ctx.toolName) ? ('memory_search' as const) : ('tool_exec' as const);

  // Get parent span (should be current turn span)
  const parentSpanId = spanContext.getCurrentTurnSpan(sessionId);

  const now = Date.now();
  const startTs = now - ctx.durationMs;
  const endTs = now;

  const status = ctx.error ? ('error' as const) : ('ok' as const);

  // Build metadata based on span type
  const metadata: Record<string, unknown> = {
    toolName: ctx.toolName,
    toolArgsPreview: truncatePreview(ctx.params),
    toolResultPreview: truncatePreview(ctx.result),
    messageId: ctx.messageId,
  };

  // Add memory-specific metadata
  if (spanType === 'memory_search') {
    // Try to extract query from params
    if (typeof ctx.params === 'object' && ctx.params !== null) {
      const params = ctx.params as Record<string, unknown>;
      metadata.query = params.query || params.text || params.search;

      // Try to extract result count
      if (Array.isArray(ctx.result)) {
        metadata.resultsCount = ctx.result.length;
      } else if (
        typeof ctx.result === 'object' &&
        ctx.result !== null &&
        'results' in ctx.result
      ) {
        const resultObj = ctx.result as { results?: unknown[] };
        if (Array.isArray(resultObj.results)) {
          metadata.resultsCount = resultObj.results.length;
        }
      }
    }
  }

  // Create complete span (with start and end times)
  const span = {
    id: randomUUID(),
    traceId: sessionId,
    parentId: parentSpanId,
    sessionId,
    sessionKey: ctx.sessionKey,
    agentId,
    channel: ctx.channelId,
    accountId: null,
    conversationId: ctx.conversationId ?? null,
    spanType,
    name: `${ctx.toolName}`,
    startTs,
    endTs,
    durationMs: ctx.durationMs,
    tokensIn: 0,
    tokensOut: 0,
    costUsd: 0,
    costInputUsd: 0,
    costOutputUsd: 0,
    model: null,
    provider: null,
    status,
    errorMessage: ctx.error ?? null,
    runId: ctx.runId,
    sequenceNum: ctx.toolCallCount,
    source: 'hook' as const,
    metadata,
    createdAt: now,
  };

  writer.writeSpan(span);
}
