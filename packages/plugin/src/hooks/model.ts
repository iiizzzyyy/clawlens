/**
 * Model inference hook handlers
 *
 * Captures LLM inference events to create 'llm_call' spans.
 *
 * Note: OpenClaw's hook system doesn't provide perfect LLM span boundaries.
 * We use before_model_resolve to capture the model selection, but there's no
 * corresponding "after" hook with usage data. The llm_output hook is observable
 * but may not have structured usage data. Cost/token enrichment must come from JSONL.
 */

import type { SpanWriter } from '../db/writer.js';
import type { SpanContext } from './span-context.js';
import { parseAgentIdFromSessionKey } from './session.js';

/**
 * Hook context for before_model_resolve
 */
export interface BeforeModelResolveContext {
  sessionKey?: string;
  sessionId?: string;
  model?: string;
  provider?: string;
  messages?: unknown[];
}

/**
 * Hook context for llm_output (observable)
 */
export interface LlmOutputContext {
  sessionKey?: string;
  sessionId?: string;
  model?: string;
  provider?: string;
  output?: unknown;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    cost?: {
      input?: number;
      output?: number;
      total?: number;
    };
  };
  error?: string;
}

/**
 * Derive provider from model name if not explicitly provided
 */
function deriveProvider(model: string | undefined): string | null {
  if (!model) return null;

  if (model.startsWith('claude-')) return 'anthropic';
  if (model.startsWith('gpt-')) return 'openai';
  if (model.startsWith('gemini-')) return 'google';

  return null;
}

/**
 * Handle before_model_resolve hook
 *
 * Creates an llm_call span when model selection happens.
 * Note: This fires before session load, so messages may not be available.
 */
export function onBeforeModelResolve(
  _event: unknown,
  ctx: BeforeModelResolveContext,
  writer: SpanWriter,
  spanContext: SpanContext
): void {
  const sessionId = ctx.sessionId;
  if (!sessionId) {
    return;
  }

  const agentId = ctx.sessionKey ? parseAgentIdFromSessionKey(ctx.sessionKey) : 'unknown';

  // Get parent span (should be current turn span)
  const parentSpanId = spanContext.getCurrentTurnSpan(sessionId);

  const now = Date.now();

  writer.startSpan({
    traceId: sessionId,
    parentId: parentSpanId,
    sessionId,
    sessionKey: ctx.sessionKey ?? null,
    agentId,
    channel: null, // Not available in this hook
    spanType: 'llm_call',
    name: `LLM Call: ${ctx.model || 'unknown'}`,
    startTs: now,
    model: ctx.model ?? null,
    provider: ctx.provider ?? deriveProvider(ctx.model),
    source: 'hook',
    metadata: {
      requestId: '', // Will be set on llm_output if available
    },
  });

  // Note: We don't push llm_call spans onto the stack since they're leaf nodes
  // and complete quickly. Store in a separate tracking map if needed.
}

/**
 * Handle llm_output hook
 *
 * Attempts to capture LLM response with usage data if available.
 * In practice, usage data may not be in the hook context and must be enriched from JSONL.
 */
export function onLlmOutput(
  _event: unknown,
  ctx: LlmOutputContext,
  _writer: SpanWriter,
  _spanContext: SpanContext
): void {
  const sessionId = ctx.sessionId;
  if (!sessionId) {
    return;
  }

  // Try to find the most recent llm_call span for this session
  // This is a simplification - in practice we'd need more sophisticated tracking
  // For now, we'll just document that llm_output enrichment is best-effort

  // If usage data is available, we could update the span here
  // But since OpenClaw hooks don't reliably provide usage, we'll rely on JSONL enrichment

  // This is a placeholder - actual implementation would need span ID tracking
  // from onBeforeModelResolve to onLlmOutput
}
