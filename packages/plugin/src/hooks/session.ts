/**
 * Session lifecycle hook handlers
 *
 * Captures session_start and session_end events to create root session spans.
 */

import type { SpanWriter } from '../db/writer.js';
import type { SpanContext } from './span-context.js';

/**
 * Hook context for session_start
 */
export interface SessionStartContext {
  type?: 'session';
  action?: 'start';
  sessionKey: string;
  sessionId: string;
  timestamp?: Date;
  context?: {
    channelId?: string;
    accountId?: string;
    conversationId?: string;
    senderId?: string;
    senderName?: string;
    metadata?: Record<string, unknown>;
  };
}

/**
 * Hook context for session_end
 */
export interface SessionEndContext {
  type?: 'session';
  action?: 'end';
  sessionKey: string;
  sessionId: string;
  timestamp?: Date;
  context?: {
    stopReason?: string;
    lastMessage?: unknown;
    metadata?: Record<string, unknown>;
  };
}

/**
 * Parse agent ID from session key
 * Session key format: agent:<agentId>:session:<sessionId>
 */
export function parseAgentIdFromSessionKey(sessionKey: string): string {
  const match = sessionKey.match(/agent:([^:]+):/);
  return match ? match[1] : 'unknown';
}

/**
 * Handle session_start hook
 *
 * Creates a root 'session' span when a new OpenClaw session begins.
 */
export function onSessionStart(
  _event: unknown,
  ctx: SessionStartContext,
  writer: SpanWriter,
  spanContext: SpanContext
): void {
  const agentId = parseAgentIdFromSessionKey(ctx.sessionKey);
  const now = Date.now();
  const timestamp = ctx.timestamp ? ctx.timestamp.getTime() : now;

  const spanId = writer.startSpan({
    traceId: ctx.sessionId,
    sessionId: ctx.sessionId,
    sessionKey: ctx.sessionKey,
    agentId,
    channel: ctx.context?.channelId ?? null,
    accountId: ctx.context?.accountId ?? null,
    conversationId: ctx.context?.conversationId ?? null,
    spanType: 'session',
    name: `Session ${ctx.sessionId.slice(0, 8)}`,
    startTs: timestamp,
    source: 'hook',
    metadata: {
      userId: ctx.context?.senderId,
      senderName: ctx.context?.senderName,
      ...(ctx.context?.metadata || {}),
    },
  });

  // Push onto span context stack
  spanContext.pushSpan(ctx.sessionId, spanId, 'session');
}

/**
 * Handle session_end hook
 *
 * Closes the root session span when the session ends.
 */
export function onSessionEnd(
  _event: unknown,
  ctx: SessionEndContext,
  writer: SpanWriter,
  spanContext: SpanContext
): void {
  const sessionSpan = spanContext.getSessionSpan(ctx.sessionId);
  if (!sessionSpan) {
    // Session was never started (or already ended)
    return;
  }

  const now = Date.now();
  const timestamp = ctx.timestamp ? ctx.timestamp.getTime() : now;

  // End the session span
  writer.endSpan(sessionSpan.spanId, {
    endTs: timestamp,
    status: 'ok',
    metadata: {
      stopReason: ctx.context?.stopReason,
      ...(ctx.context?.metadata || {}),
    },
  });

  // Clear the session from span context
  spanContext.clearSession(ctx.sessionId);
}
