/**
 * Tests for hook handlers
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createTestDb } from '../src/db/connection.js';
import { SpanWriter } from '../src/db/writer.js';
import { SpanReader } from '../src/db/reader.js';
import type Database from 'better-sqlite3';
import { SpanContext } from '../src/hooks/span-context.js';
import {
  onSessionStart,
  onSessionEnd,
  parseAgentIdFromSessionKey,
  type SessionStartContext,
} from '../src/hooks/session.js';
import {
  onMessageReceived,
  onMessageSent,
  type MessageReceivedContext,
  type MessageSentContext,
} from '../src/hooks/message.js';
import {
  onAfterToolCall,
  isMemoryTool,
  type ToolCallContext,
} from '../src/hooks/tool.js';
import {
  onBeforeModelResolve,
  type BeforeModelResolveContext,
} from '../src/hooks/model.js';
import {
  onSubagentSpawned,
  type SubagentSpawnedContext,
} from '../src/hooks/delegation.js';

// =============================================================================
// Test Setup
// =============================================================================

let db: Database.Database;
let writer: SpanWriter;
let reader: SpanReader;
let spanContext: SpanContext;

beforeEach(() => {
  db = createTestDb();
  writer = new SpanWriter(db);
  reader = new SpanReader(db);
  spanContext = new SpanContext();
});

// =============================================================================
// Helper Functions
// =============================================================================

function createSessionKey(agentId = 'test-agent', sessionId = randomUUID()): string {
  return `agent:${agentId}:session:${sessionId}`;
}

// =============================================================================
// SpanContext Tests
// =============================================================================

describe('SpanContext', () => {
  it('should push and pop spans', () => {
    const sessionId = randomUUID();
    const spanId1 = randomUUID();
    const spanId2 = randomUUID();

    expect(spanContext.getStackDepth(sessionId)).toBe(0);

    spanContext.pushSpan(sessionId, spanId1, 'session');
    expect(spanContext.getStackDepth(sessionId)).toBe(1);

    spanContext.pushSpan(sessionId, spanId2, 'turn');
    expect(spanContext.getStackDepth(sessionId)).toBe(2);

    const popped = spanContext.popSpan(sessionId);
    expect(popped?.spanId).toBe(spanId2);
    expect(spanContext.getStackDepth(sessionId)).toBe(1);
  });

  it('should get current span', () => {
    const sessionId = randomUUID();
    const spanId1 = randomUUID();
    const spanId2 = randomUUID();

    spanContext.pushSpan(sessionId, spanId1, 'session');
    spanContext.pushSpan(sessionId, spanId2, 'turn');

    const current = spanContext.getCurrentSpan(sessionId);
    expect(current?.spanId).toBe(spanId2);
    expect(current?.spanType).toBe('turn');
  });

  it('should get session span (root)', () => {
    const sessionId = randomUUID();
    const sessionSpanId = randomUUID();
    const turnSpanId = randomUUID();

    spanContext.pushSpan(sessionId, sessionSpanId, 'session');
    spanContext.pushSpan(sessionId, turnSpanId, 'turn');

    const sessionSpan = spanContext.getSessionSpan(sessionId);
    expect(sessionSpan?.spanId).toBe(sessionSpanId);
    expect(sessionSpan?.spanType).toBe('session');
  });

  it('should track current turn span', () => {
    const sessionId = randomUUID();
    const sessionSpanId = randomUUID();
    const turnSpanId = randomUUID();

    spanContext.pushSpan(sessionId, sessionSpanId, 'session');
    expect(spanContext.getCurrentTurnSpan(sessionId)).toBeNull();

    spanContext.pushSpan(sessionId, turnSpanId, 'turn');
    expect(spanContext.getCurrentTurnSpan(sessionId)).toBe(turnSpanId);

    spanContext.popSpan(sessionId); // Pop turn
    expect(spanContext.getCurrentTurnSpan(sessionId)).toBeNull();
  });

  it('should clear session', () => {
    const sessionId = randomUUID();
    spanContext.pushSpan(sessionId, randomUUID(), 'session');
    spanContext.pushSpan(sessionId, randomUUID(), 'turn');

    expect(spanContext.hasActiveSpans(sessionId)).toBe(true);

    spanContext.clearSession(sessionId);
    expect(spanContext.hasActiveSpans(sessionId)).toBe(false);
    expect(spanContext.getStackDepth(sessionId)).toBe(0);
  });

  it('should handle multiple sessions independently', () => {
    const session1 = randomUUID();
    const session2 = randomUUID();

    spanContext.pushSpan(session1, randomUUID(), 'session');
    spanContext.pushSpan(session2, randomUUID(), 'session');

    expect(spanContext.getStackDepth(session1)).toBe(1);
    expect(spanContext.getStackDepth(session2)).toBe(1);

    spanContext.clearSession(session1);
    expect(spanContext.getStackDepth(session1)).toBe(0);
    expect(spanContext.getStackDepth(session2)).toBe(1);
  });
});

// =============================================================================
// Session Hook Tests
// =============================================================================

describe('Session Hooks', () => {
  it('should parse agent ID from session key', () => {
    expect(parseAgentIdFromSessionKey('agent:main:session:abc')).toBe('main');
    expect(parseAgentIdFromSessionKey('agent:test-agent:session:xyz')).toBe('test-agent');
    expect(parseAgentIdFromSessionKey('invalid-key')).toBe('unknown');
  });

  it('should create session span on session_start', () => {
    const sessionId = randomUUID();
    const sessionKey = createSessionKey('test-agent', sessionId);

    const ctx: SessionStartContext = {
      sessionKey,
      sessionId,
      timestamp: new Date(Date.now()),
      context: {
        channelId: 'telegram',
        accountId: 'acc123',
        conversationId: 'conv456',
        senderId: 'user789',
      },
    };

    onSessionStart(null, ctx, writer, spanContext);

    // Check span was created
    const spans = reader.getSessionReplay(sessionId);
    expect(spans.length).toBe(1);
    expect(spans[0].spanType).toBe('session');
    expect(spans[0].agentId).toBe('test-agent');
    expect(spans[0].channel).toBe('telegram');
    expect(spans[0].accountId).toBe('acc123');
    expect(spans[0].conversationId).toBe('conv456');

    // Check span context was updated
    expect(spanContext.hasActiveSpans(sessionId)).toBe(true);
    expect(spanContext.getStackDepth(sessionId)).toBe(1);
  });

  it('should handle missing context fields gracefully', () => {
    const sessionId = randomUUID();
    const sessionKey = createSessionKey('test-agent', sessionId);

    const ctx: SessionStartContext = {
      sessionKey,
      sessionId,
      // No timestamp or context
    };

    onSessionStart(null, ctx, writer, spanContext);

    const spans = reader.getSessionReplay(sessionId);
    expect(spans.length).toBe(1);
    expect(spans[0].channel).toBeNull();
    expect(spans[0].accountId).toBeNull();
  });

  it('should end session span on session_end', () => {
    const sessionId = randomUUID();
    const sessionKey = createSessionKey('test-agent', sessionId);

    // Start session
    onSessionStart(
      null,
      { sessionKey, sessionId, timestamp: new Date() },
      writer,
      spanContext
    );

    const startSpans = reader.getSessionReplay(sessionId);
    expect(startSpans[0].endTs).toBeNull();

    // End session
    onSessionEnd(
      null,
      {
        sessionKey,
        sessionId,
        timestamp: new Date(Date.now() + 5000),
        context: { stopReason: 'user_ended' },
      },
      writer,
      spanContext
    );

    const endSpans = reader.getSessionReplay(sessionId);
    expect(endSpans[0].endTs).not.toBeNull();
    expect(endSpans[0].metadata).toMatchObject({ stopReason: 'user_ended' });
    expect(spanContext.hasActiveSpans(sessionId)).toBe(false);
  });

  it('should handle session_end without matching session_start', () => {
    const sessionId = randomUUID();
    const sessionKey = createSessionKey('test-agent', sessionId);

    // End non-existent session (should not throw)
    expect(() => {
      onSessionEnd(null, { sessionKey, sessionId }, writer, spanContext);
    }).not.toThrow();
  });
});

// =============================================================================
// Message Hook Tests
// =============================================================================

describe('Message Hooks', () => {
  it('should create turn span on message_received', () => {
    const sessionId = randomUUID();
    const sessionKey = createSessionKey('test-agent', sessionId);

    // Start session first
    onSessionStart(null, { sessionKey, sessionId }, writer, spanContext);

    // Receive message
    const ctx: MessageReceivedContext = {
      type: 'message',
      action: 'received',
      context: {
        from: 'user123',
        content: 'Hello, how are you?',
        timestamp: Date.now(),
        channelId: 'telegram',
        sessionKey,
        sessionId,
        messageId: 'msg1',
      },
    };

    onMessageReceived(null, ctx, writer, spanContext);

    const spans = reader.getSessionReplay(sessionId);
    expect(spans.length).toBe(2); // session + turn

    const turnSpan = spans.find((s) => s.spanType === 'turn');
    expect(turnSpan).toBeDefined();
    expect(turnSpan!.parentId).toBe(spans[0].id); // Parent is session span
    expect(turnSpan!.metadata.userMessagePreview).toBe('Hello, how are you?');
    expect(turnSpan!.metadata.from).toBe('user123');
  });

  it('should truncate long message previews', () => {
    const sessionId = randomUUID();
    const sessionKey = createSessionKey('test-agent', sessionId);

    onSessionStart(null, { sessionKey, sessionId }, writer, spanContext);

    const longMessage = 'A'.repeat(300);
    const ctx: MessageReceivedContext = {
      context: {
        content: longMessage,
        sessionKey,
        sessionId,
      },
    };

    onMessageReceived(null, ctx, writer, spanContext);

    const spans = reader.getSessionReplay(sessionId);
    const turnSpan = spans.find((s) => s.spanType === 'turn');
    const preview = turnSpan!.metadata.userMessagePreview as string;
    expect(preview.length).toBeLessThanOrEqual(203); // 200 + "..."
  });

  it('should end turn span on message_sent', () => {
    const sessionId = randomUUID();
    const sessionKey = createSessionKey('test-agent', sessionId);

    onSessionStart(null, { sessionKey, sessionId }, writer, spanContext);
    onMessageReceived(
      null,
      { context: { sessionKey, sessionId } },
      writer,
      spanContext
    );

    const beforeSent = reader.getSessionReplay(sessionId);
    const turnSpan = beforeSent.find((s) => s.spanType === 'turn');
    expect(turnSpan!.endTs).toBeNull();

    // Send message
    const ctx: MessageSentContext = {
      type: 'message',
      action: 'sent',
      context: {
        to: 'user123',
        content: 'I am doing well!',
        success: true,
        sessionKey,
        sessionId,
        messageId: 'msg2',
      },
    };

    onMessageSent(null, ctx, writer, spanContext);

    const afterSent = reader.getSessionReplay(sessionId);
    const updatedTurnSpan = afterSent.find((s) => s.spanType === 'turn');
    expect(updatedTurnSpan!.endTs).not.toBeNull();
    expect(updatedTurnSpan!.status).toBe('ok');
    expect(updatedTurnSpan!.metadata.assistantMessagePreview).toBe('I am doing well!');
  });

  it('should handle message_sent with error', () => {
    const sessionId = randomUUID();
    const sessionKey = createSessionKey('test-agent', sessionId);

    onSessionStart(null, { sessionKey, sessionId }, writer, spanContext);
    onMessageReceived(
      null,
      { context: { sessionKey, sessionId } },
      writer,
      spanContext
    );

    const ctx: MessageSentContext = {
      context: {
        success: false,
        error: 'API timeout',
        sessionKey,
        sessionId,
      },
    };

    onMessageSent(null, ctx, writer, spanContext);

    const spans = reader.getSessionReplay(sessionId);
    const turnSpan = spans.find((s) => s.spanType === 'turn');
    expect(turnSpan!.status).toBe('error');
    expect(turnSpan!.errorMessage).toBe('API timeout');
  });

  it('should handle message_received without sessionId', () => {
    const ctx: MessageReceivedContext = {
      context: {
        content: 'Hello',
        // No sessionId
      },
    };

    expect(() => {
      onMessageReceived(null, ctx, writer, spanContext);
    }).not.toThrow();

    // No spans should be created
    const allSpans = db.prepare('SELECT COUNT(*) as count FROM spans').get() as { count: number };
    expect(allSpans.count).toBe(0);
  });
});

// =============================================================================
// Tool Hook Tests
// =============================================================================

describe('Tool Hooks', () => {
  it('should identify memory tools', () => {
    expect(isMemoryTool('memory_search')).toBe(true);
    expect(isMemoryTool('memory_get')).toBe(true);
    expect(isMemoryTool('memory_recall')).toBe(true);
    expect(isMemoryTool('bash')).toBe(false);
    expect(isMemoryTool('browser')).toBe(false);
  });

  it('should create tool_exec span on after_tool_call', () => {
    const sessionId = randomUUID();
    const sessionKey = createSessionKey('test-agent', sessionId);

    // Set up session and turn
    onSessionStart(null, { sessionKey, sessionId }, writer, spanContext);
    onMessageReceived(
      null,
      { context: { sessionKey, sessionId } },
      writer,
      spanContext
    );

    const ctx: ToolCallContext = {
      toolName: 'bash',
      params: { command: 'ls -la' },
      result: 'total 48\ndrwxr-xr-x...',
      durationMs: 250,
      sessionKey,
      channelId: 'telegram',
      runId: randomUUID(),
      toolCallCount: 1,
      sessionId,
    };

    onAfterToolCall(null, ctx, writer, spanContext);

    const spans = reader.getSessionReplay(sessionId);
    const toolSpan = spans.find((s) => s.spanType === 'tool_exec');

    expect(toolSpan).toBeDefined();
    expect(toolSpan!.name).toBe('bash');
    expect(toolSpan!.durationMs).toBe(250);
    expect(toolSpan!.runId).toBe(ctx.runId);
    expect(toolSpan!.sequenceNum).toBe(1);
    expect(toolSpan!.metadata.toolName).toBe('bash');
  });

  it('should create memory_search span for memory tools', () => {
    const sessionId = randomUUID();
    const sessionKey = createSessionKey('test-agent', sessionId);

    onSessionStart(null, { sessionKey, sessionId }, writer, spanContext);
    onMessageReceived(
      null,
      { context: { sessionKey, sessionId } },
      writer,
      spanContext
    );

    const ctx: ToolCallContext = {
      toolName: 'memory_search',
      params: { query: 'find relevant context' },
      result: [{ id: '1', text: 'Result 1' }, { id: '2', text: 'Result 2' }],
      durationMs: 150,
      sessionKey,
      channelId: 'telegram',
      runId: randomUUID(),
      toolCallCount: 1,
      sessionId,
    };

    onAfterToolCall(null, ctx, writer, spanContext);

    const spans = reader.getSessionReplay(sessionId);
    const memorySpan = spans.find((s) => s.spanType === 'memory_search');

    expect(memorySpan).toBeDefined();
    expect(memorySpan!.metadata.query).toBe('find relevant context');
    expect(memorySpan!.metadata.resultsCount).toBe(2);
  });

  it('should handle tool execution with error', () => {
    const sessionId = randomUUID();
    const sessionKey = createSessionKey('test-agent', sessionId);

    onSessionStart(null, { sessionKey, sessionId }, writer, spanContext);
    onMessageReceived(
      null,
      { context: { sessionKey, sessionId } },
      writer,
      spanContext
    );

    const ctx: ToolCallContext = {
      toolName: 'bash',
      params: { command: 'invalid-command' },
      result: null,
      error: 'Command not found',
      durationMs: 50,
      sessionKey,
      channelId: 'telegram',
      runId: randomUUID(),
      toolCallCount: 1,
      sessionId,
    };

    onAfterToolCall(null, ctx, writer, spanContext);

    const spans = reader.getSessionReplay(sessionId);
    const toolSpan = spans.find((s) => s.spanType === 'tool_exec');

    expect(toolSpan!.status).toBe('error');
    expect(toolSpan!.errorMessage).toBe('Command not found');
  });

  it('should set parent to current turn span', () => {
    const sessionId = randomUUID();
    const sessionKey = createSessionKey('test-agent', sessionId);

    onSessionStart(null, { sessionKey, sessionId }, writer, spanContext);
    onMessageReceived(
      null,
      { context: { sessionKey, sessionId } },
      writer,
      spanContext
    );

    const spans1 = reader.getSessionReplay(sessionId);
    const turnSpan = spans1.find((s) => s.spanType === 'turn');

    const ctx: ToolCallContext = {
      toolName: 'bash',
      params: { command: 'pwd' },
      result: '/home/user',
      durationMs: 10,
      sessionKey,
      channelId: 'telegram',
      runId: randomUUID(),
      toolCallCount: 1,
      sessionId,
    };

    onAfterToolCall(null, ctx, writer, spanContext);

    const spans2 = reader.getSessionReplay(sessionId);
    const toolSpan = spans2.find((s) => s.spanType === 'tool_exec');

    expect(toolSpan!.parentId).toBe(turnSpan!.id);
  });

  it('should truncate long tool args and results', () => {
    const sessionId = randomUUID();
    const sessionKey = createSessionKey('test-agent', sessionId);

    onSessionStart(null, { sessionKey, sessionId }, writer, spanContext);
    onMessageReceived(
      null,
      { context: { sessionKey, sessionId } },
      writer,
      spanContext
    );

    const longArgs = { data: 'A'.repeat(1000) };
    const longResult = 'B'.repeat(1000);

    const ctx: ToolCallContext = {
      toolName: 'bash',
      params: longArgs,
      result: longResult,
      durationMs: 100,
      sessionKey,
      channelId: 'telegram',
      runId: randomUUID(),
      toolCallCount: 1,
      sessionId,
    };

    onAfterToolCall(null, ctx, writer, spanContext);

    const spans = reader.getSessionReplay(sessionId);
    const toolSpan = spans.find((s) => s.spanType === 'tool_exec');

    const argsPreview = toolSpan!.metadata.toolArgsPreview as string;
    const resultPreview = toolSpan!.metadata.toolResultPreview as string;

    expect(argsPreview.length).toBeLessThanOrEqual(503); // 500 + "..."
    expect(resultPreview.length).toBeLessThanOrEqual(503);
  });
});

// =============================================================================
// Model Hook Tests
// =============================================================================

describe('Model Hooks', () => {
  it('should create llm_call span on before_model_resolve', () => {
    const sessionId = randomUUID();
    const sessionKey = createSessionKey('test-agent', sessionId);

    onSessionStart(null, { sessionKey, sessionId }, writer, spanContext);
    onMessageReceived(
      null,
      { context: { sessionKey, sessionId } },
      writer,
      spanContext
    );

    const ctx: BeforeModelResolveContext = {
      sessionKey,
      sessionId,
      model: 'claude-sonnet-4',
      provider: 'anthropic',
    };

    onBeforeModelResolve(null, ctx, writer, spanContext);

    const spans = reader.getSessionReplay(sessionId);
    const llmSpan = spans.find((s) => s.spanType === 'llm_call');

    expect(llmSpan).toBeDefined();
    expect(llmSpan!.model).toBe('claude-sonnet-4');
    expect(llmSpan!.provider).toBe('anthropic');
  });

  it('should derive provider from model name if not provided', () => {
    const sessionId = randomUUID();
    const sessionKey = createSessionKey('test-agent', sessionId);

    onSessionStart(null, { sessionKey, sessionId }, writer, spanContext);
    onMessageReceived(
      null,
      { context: { sessionKey, sessionId } },
      writer,
      spanContext
    );

    const ctx: BeforeModelResolveContext = {
      sessionKey,
      sessionId,
      model: 'gpt-4',
      // No provider
    };

    onBeforeModelResolve(null, ctx, writer, spanContext);

    const spans = reader.getSessionReplay(sessionId);
    const llmSpan = spans.find((s) => s.spanType === 'llm_call');

    expect(llmSpan!.provider).toBe('openai');
  });

  it('should set parent to current turn span', () => {
    const sessionId = randomUUID();
    const sessionKey = createSessionKey('test-agent', sessionId);

    onSessionStart(null, { sessionKey, sessionId }, writer, spanContext);
    onMessageReceived(
      null,
      { context: { sessionKey, sessionId } },
      writer,
      spanContext
    );

    const spans1 = reader.getSessionReplay(sessionId);
    const turnSpan = spans1.find((s) => s.spanType === 'turn');

    onBeforeModelResolve(
      null,
      { sessionKey, sessionId, model: 'claude-opus-4' },
      writer,
      spanContext
    );

    const spans2 = reader.getSessionReplay(sessionId);
    const llmSpan = spans2.find((s) => s.spanType === 'llm_call');

    expect(llmSpan!.parentId).toBe(turnSpan!.id);
  });
});

// =============================================================================
// Delegation Hook Tests
// =============================================================================

describe('Delegation Hooks', () => {
  it('should create delegation span on subagent_spawned', () => {
    const parentSessionId = randomUUID();
    const parentSessionKey = createSessionKey('parent-agent', parentSessionId);
    const childSessionId = randomUUID();

    onSessionStart(
      null,
      { sessionKey: parentSessionKey, sessionId: parentSessionId },
      writer,
      spanContext
    );
    onMessageReceived(
      null,
      { context: { sessionKey: parentSessionKey, sessionId: parentSessionId } },
      writer,
      spanContext
    );

    const ctx: SubagentSpawnedContext = {
      parentSessionKey,
      parentSessionId,
      targetAgentId: 'child-agent',
      childSessionId,
      delegationType: 'session-spawn',
      timestamp: Date.now(),
    };

    onSubagentSpawned(null, ctx, writer, spanContext);

    const spans = reader.getSessionReplay(parentSessionId);
    const delegationSpan = spans.find((s) => s.spanType === 'delegation');

    expect(delegationSpan).toBeDefined();
    expect(delegationSpan!.name).toBe('Delegate to child-agent');
    expect(delegationSpan!.metadata.targetAgentId).toBe('child-agent');
    expect(delegationSpan!.metadata.childSessionId).toBe(childSessionId);
    expect(delegationSpan!.metadata.delegationType).toBe('session-spawn');
  });
});

// =============================================================================
// Parent-Child Relationship Tests
// =============================================================================

describe('Parent-Child Relationships', () => {
  it('should maintain correct span hierarchy', () => {
    const sessionId = randomUUID();
    const sessionKey = createSessionKey('test-agent', sessionId);

    // Create full hierarchy: session -> turn -> tool
    onSessionStart(null, { sessionKey, sessionId }, writer, spanContext);
    onMessageReceived(
      null,
      { context: { sessionKey, sessionId } },
      writer,
      spanContext
    );
    onAfterToolCall(
      null,
      {
        toolName: 'bash',
        params: {},
        result: 'ok',
        durationMs: 100,
        sessionKey,
        channelId: 'test',
        runId: randomUUID(),
        toolCallCount: 1,
        sessionId,
      },
      writer,
      spanContext
    );

    const tree = reader.getSpanTree(sessionId);
    expect(tree).not.toBeNull();
    expect(tree!.spanType).toBe('session');
    expect(tree!.children.length).toBe(1);
    expect(tree!.children[0].spanType).toBe('turn');
    expect(tree!.children[0].children.length).toBe(1);
    expect(tree!.children[0].children[0].spanType).toBe('tool_exec');
  });

  it('should handle multiple turns in same session', () => {
    const sessionId = randomUUID();
    const sessionKey = createSessionKey('test-agent', sessionId);

    onSessionStart(null, { sessionKey, sessionId }, writer, spanContext);

    // Turn 1
    onMessageReceived(
      null,
      { context: { sessionKey, sessionId } },
      writer,
      spanContext
    );
    onMessageSent(
      null,
      { context: { sessionKey, sessionId, success: true } },
      writer,
      spanContext
    );

    // Turn 2
    onMessageReceived(
      null,
      { context: { sessionKey, sessionId } },
      writer,
      spanContext
    );
    onMessageSent(
      null,
      { context: { sessionKey, sessionId, success: true } },
      writer,
      spanContext
    );

    const tree = reader.getSpanTree(sessionId);
    expect(tree!.children.length).toBe(2);
    expect(tree!.children[0].spanType).toBe('turn');
    expect(tree!.children[1].spanType).toBe('turn');
  });

  it('should handle multiple tools in same turn', () => {
    const sessionId = randomUUID();
    const sessionKey = createSessionKey('test-agent', sessionId);
    const runId = randomUUID();

    onSessionStart(null, { sessionKey, sessionId }, writer, spanContext);
    onMessageReceived(
      null,
      { context: { sessionKey, sessionId } },
      writer,
      spanContext
    );

    // Tool 1
    onAfterToolCall(
      null,
      {
        toolName: 'bash',
        params: {},
        result: 'ok',
        durationMs: 100,
        sessionKey,
        channelId: 'test',
        runId,
        toolCallCount: 1,
        sessionId,
      },
      writer,
      spanContext
    );

    // Tool 2
    onAfterToolCall(
      null,
      {
        toolName: 'browser',
        params: {},
        result: 'ok',
        durationMs: 100, // Same duration so order is by sequenceNum
        sessionKey,
        channelId: 'test',
        runId,
        toolCallCount: 2,
        sessionId,
      },
      writer,
      spanContext
    );

    const tree = reader.getSpanTree(sessionId);
    const turnSpan = tree!.children[0];
    expect(turnSpan.children.length).toBe(2);
    expect(turnSpan.children[0].runId).toBe(runId);
    expect(turnSpan.children[1].runId).toBe(runId);
    expect(turnSpan.children[0].sequenceNum).toBe(1);
    expect(turnSpan.children[1].sequenceNum).toBe(2);
  });
});
