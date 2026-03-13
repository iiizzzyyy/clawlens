/**
 * Sub-agent delegation hook handlers
 *
 * Captures agent delegation events to create 'delegation' spans.
 */

import type { SpanWriter } from '../db/writer.js';
import type { SpanContext } from './span-context.js';
import { parseAgentIdFromSessionKey } from './session.js';

/**
 * Hook context for subagent_spawned
 */
export interface SubagentSpawnedContext {
  parentSessionKey?: string;
  parentSessionId?: string;
  targetAgentId?: string;
  childSessionId?: string;
  childSessionKey?: string;
  delegationType?: string; // 'session-spawn' | 'agent-send'
  timestamp?: number;
}

/**
 * Hook context for subagent_ended
 */
export interface SubagentEndedContext {
  parentSessionKey?: string;
  parentSessionId?: string;
  childSessionId?: string;
  targetAgentId?: string;
  success?: boolean;
  error?: string;
  timestamp?: number;
}

/**
 * Handle subagent_spawned hook
 *
 * Creates a 'delegation' span when a sub-agent is spawned.
 */
export function onSubagentSpawned(
  _event: unknown,
  ctx: SubagentSpawnedContext,
  writer: SpanWriter,
  spanContext: SpanContext
): void {
  const parentSessionId = ctx.parentSessionId;
  if (!parentSessionId) {
    return;
  }

  const agentId = ctx.parentSessionKey
    ? parseAgentIdFromSessionKey(ctx.parentSessionKey)
    : 'unknown';

  // Get parent span (should be current turn span in parent session)
  const parentSpanId = spanContext.getCurrentTurnSpan(parentSessionId);

  const now = Date.now();
  const timestamp = ctx.timestamp ?? now;

  writer.startSpan({
    traceId: parentSessionId,
    parentId: parentSpanId,
    sessionId: parentSessionId,
    sessionKey: ctx.parentSessionKey ?? null,
    agentId,
    channel: null,
    spanType: 'delegation',
    name: `Delegate to ${ctx.targetAgentId || 'unknown'}`,
    startTs: timestamp,
    source: 'hook',
    metadata: {
      targetAgentId: ctx.targetAgentId,
      childSessionId: ctx.childSessionId,
      childSessionKey: ctx.childSessionKey,
      delegationType: ctx.delegationType,
    },
  });

  // Note: We could track delegation spans for linking, but for V1 we'll keep it simple
}

/**
 * Handle subagent_ended hook
 *
 * Closes the delegation span when the sub-agent completes.
 */
export function onSubagentEnded(
  _event: unknown,
  ctx: SubagentEndedContext,
  _writer: SpanWriter,
  _spanContext: SpanContext
): void {
  const parentSessionId = ctx.parentSessionId;
  if (!parentSessionId) {
    return;
  }

  // Finding the right delegation span to close is tricky without tracking
  // For V1, we'll document this as a limitation and rely on JSONL import
  // for complete delegation tracking

  // In a full implementation, we'd track delegation span IDs from onSubagentSpawned
  // and match them here by childSessionId
}
