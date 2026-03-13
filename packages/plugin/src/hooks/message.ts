/**
 * Message lifecycle hook handlers
 *
 * Captures message_received and message_sent events to create 'turn' spans.
 */

import type { SpanWriter } from '../db/writer.js';
import type { SpanContext } from './span-context.js';
import { parseAgentIdFromSessionKey } from './session.js';

/**
 * Hook context for message_received
 */
export interface MessageReceivedContext {
  type?: 'message';
  action?: 'received';
  messages?: string[];
  context?: {
    from?: string;
    content?: string;
    timestamp?: number;
    channelId?: string;
    accountId?: string;
    conversationId?: string;
    messageId?: string;
    sessionKey?: string;
    sessionId?: string;
    metadata?: {
      to?: string;
      provider?: string;
      threadId?: string;
      senderName?: string;
      senderUsername?: string;
      [key: string]: unknown;
    };
  };
}

/**
 * Hook context for message_sent
 */
export interface MessageSentContext {
  type?: 'message';
  action?: 'sent';
  messages?: string[];
  context?: {
    to?: string;
    content?: string;
    success?: boolean;
    error?: string;
    channelId?: string;
    accountId?: string;
    conversationId?: string;
    messageId?: string;
    sessionKey?: string;
    sessionId?: string;
    isGroup?: boolean;
    groupId?: string;
    // Note: OpenClaw hooks don't include usage/cost - that comes from JSONL
    usage?: {
      inputTokens?: number;
      outputTokens?: number;
      cost?: {
        input?: number;
        output?: number;
        total?: number;
      };
    };
  };
}

/**
 * Truncate text preview to max length
 */
function truncatePreview(text: string | undefined, maxLength = 200): string | undefined {
  if (!text) return undefined;
  return text.length > maxLength ? text.slice(0, maxLength) + '...' : text;
}

/**
 * Handle message_received hook
 *
 * Creates a 'turn' span when a user message is received.
 */
export function onMessageReceived(
  _event: unknown,
  ctx: MessageReceivedContext,
  writer: SpanWriter,
  spanContext: SpanContext
): void {
  // Extract session info (may be in context or need to derive from sessionKey)
  const sessionId = ctx.context?.sessionId;
  const sessionKey = ctx.context?.sessionKey;

  if (!sessionId) {
    // Can't create span without session ID
    return;
  }

  const agentId = sessionKey ? parseAgentIdFromSessionKey(sessionKey) : 'unknown';
  const now = Date.now();
  const timestamp = ctx.context?.timestamp ?? now;

  // Get parent span (should be session span)
  const parentSpan = spanContext.getCurrentSpan(sessionId);

  const spanId = writer.startSpan({
    traceId: sessionId,
    parentId: parentSpan?.spanId ?? null,
    sessionId,
    sessionKey: sessionKey ?? null,
    agentId,
    channel: ctx.context?.channelId ?? null,
    accountId: ctx.context?.accountId ?? null,
    conversationId: ctx.context?.conversationId ?? null,
    spanType: 'turn',
    name: `Turn ${timestamp}`,
    startTs: timestamp,
    source: 'hook',
    metadata: {
      userMessagePreview: truncatePreview(ctx.context?.content),
      messageId: ctx.context?.messageId,
      from: ctx.context?.from,
      ...(ctx.context?.metadata || {}),
    },
  });

  // Push onto span context stack
  spanContext.pushSpan(sessionId, spanId, 'turn');
}

/**
 * Handle message_sent hook
 *
 * Closes the turn span when the assistant response is sent.
 * Note: This hook does NOT contain usage/cost data - that must be enriched from JSONL.
 */
export function onMessageSent(
  _event: unknown,
  ctx: MessageSentContext,
  writer: SpanWriter,
  spanContext: SpanContext
): void {
  const sessionId = ctx.context?.sessionId;

  if (!sessionId) {
    return;
  }

  // Get the current turn span (should be on top of stack)
  const currentSpan = spanContext.getCurrentSpan(sessionId);
  if (!currentSpan || currentSpan.spanType !== 'turn') {
    // No active turn span to end
    return;
  }

  const now = Date.now();
  const status = ctx.context?.success === false ? 'error' : 'ok';

  // End the turn span
  writer.endSpan(currentSpan.spanId, {
    endTs: now,
    status,
    errorMessage: ctx.context?.error ?? null,
    // If usage data is available (rare in hooks), capture it
    tokensIn: ctx.context?.usage?.inputTokens,
    tokensOut: ctx.context?.usage?.outputTokens,
    costUsd: ctx.context?.usage?.cost?.total,
    costInputUsd: ctx.context?.usage?.cost?.input,
    costOutputUsd: ctx.context?.usage?.cost?.output,
    metadata: {
      assistantMessagePreview: truncatePreview(ctx.context?.content),
      messageId: ctx.context?.messageId,
      to: ctx.context?.to,
      isGroup: ctx.context?.isGroup,
      groupId: ctx.context?.groupId,
    },
  });

  // Pop from span context stack
  spanContext.popSpan(sessionId);
}
