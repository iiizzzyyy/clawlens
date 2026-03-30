/**
 * Hook registration entry point
 *
 * Exports a single function to register all ClawLens hooks with the OpenClaw plugin API.
 */

import type { SpanWriter } from '../db/writer.js';
import { SpanContext } from './span-context.js';
import type { FlowBus } from '../events/flow-bus.js';
import {
  onSessionStart,
  onSessionEnd,
  parseAgentIdFromSessionKey,
  type SessionStartContext,
  type SessionEndContext,
} from './session.js';
import {
  onMessageReceived,
  onMessageSent,
  type MessageReceivedContext,
  type MessageSentContext,
} from './message.js';
import {
  onAfterToolCall,
  type ToolCallContext,
} from './tool.js';
import {
  onBeforeModelResolve,
  onLlmOutput,
  type BeforeModelResolveContext,
  type LlmOutputContext,
} from './model.js';
import {
  onSubagentSpawned,
  onSubagentEnded,
  type SubagentSpawnedContext,
  type SubagentEndedContext,
} from './delegation.js';

// Export all types for external use
export type {
  SessionStartContext,
  SessionEndContext,
  MessageReceivedContext,
  MessageSentContext,
  ToolCallContext,
  BeforeModelResolveContext,
  LlmOutputContext,
  SubagentSpawnedContext,
  SubagentEndedContext,
};

export { SpanContext };

/**
 * Minimal PluginAPI interface for type safety
 *
 * Represents the OpenClaw plugin API methods we use.
 * TODO: Import from openclaw when types are available.
 */
export interface PluginAPI {
  registerHook(
    eventName: string,
    handler: (event: unknown, ctx: unknown) => void | Promise<void>,
    metadata?: { priority?: number; name?: string }
  ): void;
  registerHttpRoute(config: {
    path: string;
    auth: 'gateway' | 'plugin';
    match?: 'exact' | 'prefix';
    replaceExisting?: boolean;
    handler: (req: unknown, res: unknown) => Promise<boolean>;
  }): void;
  config: Record<string, unknown>;
  logger: {
    info(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
  };
}

/**
 * Register all ClawLens lifecycle hooks
 *
 * @param api - OpenClaw Plugin API
 * @param writer - SpanWriter instance for database operations
 * @returns SpanContext instance for span tracking
 */
export function registerHooks(api: PluginAPI, writer: SpanWriter, flowBus?: FlowBus): SpanContext {
  const spanContext = new SpanContext();

  api.logger.info('[clawlens] Registering lifecycle hooks');

  // Session hooks
  api.registerHook(
    'session_start',
    (event, ctx) => {
      try {
        const typedCtx = ctx as SessionStartContext;
        onSessionStart(event, typedCtx, writer, spanContext);
        flowBus?.emit({
          type: 'span',
          data: {
            spanType: 'session_start',
            agentId: parseAgentIdFromSessionKey(typedCtx.sessionKey ?? ''),
            name: 'Session started',
            status: 'ok',
            timestamp: Date.now(),
            metadata: { sessionId: typedCtx.sessionId },
          },
        });
      } catch (error) {
        api.logger.error('[clawlens] Error in session_start hook:', error);
      }
    },
    { name: 'clawlens-session-start' }
  );

  api.registerHook(
    'session_end',
    (event, ctx) => {
      try {
        const typedCtx = ctx as SessionEndContext;
        onSessionEnd(event, typedCtx, writer, spanContext);
        flowBus?.emit({
          type: 'span',
          data: {
            spanType: 'session_end',
            agentId: parseAgentIdFromSessionKey(typedCtx.sessionKey ?? ''),
            name: 'Session ended',
            status: 'ok',
            timestamp: Date.now(),
            metadata: { sessionId: typedCtx.sessionId },
          },
        });
      } catch (error) {
        api.logger.error('[clawlens] Error in session_end hook:', error);
      }
    },
    { name: 'clawlens-session-end' }
  );

  // Message hooks
  api.registerHook(
    'message_received',
    (event, ctx) => {
      try {
        const typedCtx = ctx as MessageReceivedContext;
        onMessageReceived(event, typedCtx, writer, spanContext);
        flowBus?.emit({
          type: 'span',
          data: {
            spanType: 'message_received',
            agentId: parseAgentIdFromSessionKey(typedCtx.context?.sessionKey ?? ''),
            name: 'Message received',
            status: 'ok',
            timestamp: Date.now(),
            metadata: { channel: typedCtx.context?.channelId },
          },
        });
      } catch (error) {
        api.logger.error('[clawlens] Error in message_received hook:', error);
      }
    },
    { name: 'clawlens-message-received' }
  );

  api.registerHook(
    'message_sent',
    (event, ctx) => {
      try {
        const typedCtx = ctx as MessageSentContext;
        onMessageSent(event, typedCtx, writer, spanContext);
        flowBus?.emit({
          type: 'span',
          data: {
            spanType: 'message_sent',
            agentId: parseAgentIdFromSessionKey(typedCtx.context?.sessionKey ?? ''),
            name: 'Message sent',
            status: 'ok',
            timestamp: Date.now(),
            metadata: { channel: typedCtx.context?.channelId },
          },
        });
      } catch (error) {
        api.logger.error('[clawlens] Error in message_sent hook:', error);
      }
    },
    { name: 'clawlens-message-sent' }
  );

  // Tool hooks
  api.registerHook(
    'after_tool_call',
    (event, ctx) => {
      try {
        const typedCtx = ctx as ToolCallContext;
        onAfterToolCall(event, typedCtx, writer, spanContext);
        flowBus?.emit({
          type: 'span',
          data: {
            spanType: 'after_tool_call',
            agentId: parseAgentIdFromSessionKey(typedCtx.sessionKey ?? ''),
            name: `Tool: ${typedCtx.toolName ?? 'unknown'}`,
            status: typedCtx.error ? 'error' : 'ok',
            timestamp: Date.now(),
            metadata: { toolName: typedCtx.toolName },
          },
        });
      } catch (error) {
        api.logger.error('[clawlens] Error in after_tool_call hook:', error);
      }
    },
    { name: 'clawlens-after-tool-call' }
  );

  // Model hooks (best-effort, cost enrichment from JSONL)
  api.registerHook(
    'before_model_resolve',
    (event, ctx) => {
      try {
        onBeforeModelResolve(event, ctx as BeforeModelResolveContext, writer, spanContext);
      } catch (error) {
        api.logger.error('[clawlens] Error in before_model_resolve hook:', error);
      }
    },
    { name: 'clawlens-before-model-resolve' }
  );

  api.registerHook(
    'llm_output',
    (event, ctx) => {
      try {
        const typedCtx = ctx as LlmOutputContext;
        onLlmOutput(event, typedCtx, writer, spanContext);
        flowBus?.emit({
          type: 'span',
          data: {
            spanType: 'llm_output',
            agentId: parseAgentIdFromSessionKey(typedCtx.sessionKey ?? ''),
            name: `LLM: ${typedCtx.model ?? 'unknown'}`,
            status: 'ok',
            timestamp: Date.now(),
            metadata: { model: typedCtx.model, tokensOut: typedCtx.usage?.outputTokens },
          },
        });
      } catch (error) {
        api.logger.error('[clawlens] Error in llm_output hook:', error);
      }
    },
    { name: 'clawlens-llm-output' }
  );

  // Delegation hooks (best-effort)
  api.registerHook(
    'subagent_spawned',
    (event, ctx) => {
      try {
        const typedCtx = ctx as SubagentSpawnedContext;
        api.logger.info('[clawlens] subagent_spawned hook fired', {
          targetAgentId: typedCtx.targetAgentId,
          childSessionId: typedCtx.childSessionId,
        });
        onSubagentSpawned(event, typedCtx, writer, spanContext);
        flowBus?.emit({
          type: 'span',
          data: {
            spanType: 'subagent_spawned',
            agentId: typedCtx.targetAgentId ?? 'unknown',
            name: `Subagent: ${typedCtx.targetAgentId ?? 'unknown'}`,
            status: 'ok',
            timestamp: Date.now(),
            metadata: {
              childSessionId: typedCtx.childSessionId,
              targetAgentId: typedCtx.targetAgentId,
            },
          },
        });
      } catch (error) {
        api.logger.error('[clawlens] Error in subagent_spawned hook:', error);
      }
    },
    { name: 'clawlens-subagent-spawned' }
  );

  api.registerHook(
    'subagent_ended',
    (event, ctx) => {
      try {
        const typedCtx = ctx as SubagentEndedContext;
        api.logger.info('[clawlens] subagent_ended hook fired', {
          childSessionId: typedCtx.childSessionId,
          success: typedCtx.success,
        });
        onSubagentEnded(event, typedCtx, writer, spanContext);
      } catch (error) {
        api.logger.error('[clawlens] Error in subagent_ended hook:', error);
      }
    },
    { name: 'clawlens-subagent-ended' }
  );

  api.logger.info('[clawlens] All hooks registered successfully');

  return spanContext;
}
