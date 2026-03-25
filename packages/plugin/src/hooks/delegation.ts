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

  const spanId = writer.startSpan({
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

  // Track the delegation span so onSubagentEnded can close it
  if (ctx.childSessionId) {
    spanContext.trackDelegation(ctx.childSessionId, spanId);
  }
}

/**
 * Handle subagent_ended hook
 *
 * Closes the delegation span when the sub-agent completes.
 */
export function onSubagentEnded(
  _event: unknown,
  ctx: SubagentEndedContext,
  writer: SpanWriter,
  spanContext: SpanContext
): void {
  if (!ctx.parentSessionId || !ctx.childSessionId) {
    return;
  }

  const spanId = spanContext.getDelegationSpan(ctx.childSessionId);
  if (!spanId) {
    return;
  }

  const now = Date.now();
  writer.endSpan(spanId, {
    endTs: ctx.timestamp ?? now,
    status: ctx.success === false ? 'error' : 'ok',
    errorMessage: ctx.error ?? null,
  });

  spanContext.clearDelegation(ctx.childSessionId);
}
