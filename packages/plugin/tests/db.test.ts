/**
 * Tests for database operations
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import {
  migrate,
  SCHEMA_VERSION,
  getCurrentVersion,
  needsMigration,
} from '../src/db/schema.js';
import { SpanWriter } from '../src/db/writer.js';
import { SpanReader } from '../src/db/reader.js';
import type { Span } from '../src/db/types.js';

// =============================================================================
// Test Fixtures
// =============================================================================

function generateTestSpan(overrides: Partial<Span> = {}): Span {
  const id = randomUUID();
  const sessionId = overrides.sessionId ?? randomUUID();
  const now = Date.now();

  return {
    id,
    traceId: sessionId,
    parentId: null,
    sessionId,
    sessionKey: `agent:test-agent:session:${sessionId}`,
    agentId: 'test-agent',
    channel: 'test',
    accountId: null,
    conversationId: null,
    spanType: 'session',
    name: 'Test Session',
    startTs: now,
    endTs: now + 1000,
    durationMs: 1000,
    tokensIn: 100,
    tokensOut: 50,
    costUsd: 0.001,
    costInputUsd: 0.0006,
    costOutputUsd: 0.0004,
    model: 'claude-sonnet-4',
    provider: 'anthropic',
    status: 'ok',
    errorMessage: null,
    runId: null,
    sequenceNum: null,
    source: 'hook',
    metadata: {},
    createdAt: now,
    ...overrides,
  };
}

function generateTestSession(
  sessionId: string = randomUUID()
): { sessionSpan: Span; turnSpans: Span[]; toolSpans: Span[] } {
  const now = Date.now();
  const agentId = 'test-agent';

  // Session span (root)
  const sessionSpan = generateTestSpan({
    id: randomUUID(),
    traceId: sessionId,
    sessionId,
    agentId,
    spanType: 'session',
    name: 'Test Session',
    startTs: now,
    endTs: now + 5000,
    tokensIn: 500,
    tokensOut: 200,
    costUsd: 0.01,
  });

  // Turn spans (children of session)
  const turn1Id = randomUUID();
  const turn2Id = randomUUID();

  const turnSpans: Span[] = [
    generateTestSpan({
      id: turn1Id,
      traceId: sessionId,
      parentId: sessionSpan.id,
      sessionId,
      agentId,
      spanType: 'turn',
      name: 'Turn 1',
      startTs: now + 100,
      endTs: now + 2000,
      tokensIn: 200,
      tokensOut: 100,
      costUsd: 0.004,
      metadata: {
        userMessagePreview: 'Hello, how are you?',
        assistantMessagePreview: 'I am doing well!',
      },
    }),
    generateTestSpan({
      id: turn2Id,
      traceId: sessionId,
      parentId: sessionSpan.id,
      sessionId,
      agentId,
      spanType: 'turn',
      name: 'Turn 2',
      startTs: now + 2100,
      endTs: now + 4500,
      tokensIn: 300,
      tokensOut: 100,
      costUsd: 0.006,
      metadata: {
        userMessagePreview: 'Can you help me with something?',
        assistantMessagePreview: 'Of course!',
      },
    }),
  ];

  // Tool spans (children of turns)
  const toolSpans: Span[] = [
    generateTestSpan({
      id: randomUUID(),
      traceId: sessionId,
      parentId: turn2Id,
      sessionId,
      agentId,
      spanType: 'tool_exec',
      name: 'bash: ls -la',
      startTs: now + 2200,
      endTs: now + 2500,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
      runId: randomUUID(),
      sequenceNum: 1,
      metadata: {
        toolName: 'bash',
        toolArgsPreview: '{"command": "ls -la"}',
        toolResultPreview: 'total 48\ndrwxr-xr-x...',
      },
    }),
    generateTestSpan({
      id: randomUUID(),
      traceId: sessionId,
      parentId: turn2Id,
      sessionId,
      agentId,
      spanType: 'tool_exec',
      name: 'bash: cat file.txt',
      startTs: now + 2600,
      endTs: now + 2800,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
      runId: randomUUID(),
      sequenceNum: 2,
      metadata: {
        toolName: 'bash',
        toolArgsPreview: '{"command": "cat file.txt"}',
        toolResultPreview: 'File contents...',
      },
    }),
  ];

  return { sessionSpan, turnSpans, toolSpans };
}

// =============================================================================
// Tests
// =============================================================================

describe('Schema Migrations', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('should create all tables on fresh database', () => {
    const applied = migrate(db);

    expect(applied).toBe(true);

    // Check tables exist
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];

    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain('spans');
    expect(tableNames).toContain('daily_stats');
    expect(tableNames).toContain('imports');
    expect(tableNames).toContain('schema_version');
  });

  it('should create all indexes', () => {
    migrate(db);

    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'")
      .all() as { name: string }[];

    const indexNames = indexes.map((i) => i.name);
    expect(indexNames).toContain('idx_spans_session');
    expect(indexNames).toContain('idx_spans_trace');
    expect(indexNames).toContain('idx_spans_agent');
    expect(indexNames).toContain('idx_spans_type');
    expect(indexNames).toContain('idx_spans_time');
    expect(indexNames).toContain('idx_spans_parent');
  });

  it('should record schema version', () => {
    migrate(db);

    const version = getCurrentVersion(db);
    expect(version).toBe(SCHEMA_VERSION);
  });

  it('should be idempotent on re-run', () => {
    // First migration
    const first = migrate(db);
    expect(first).toBe(true);

    // Second migration should be no-op
    const second = migrate(db);
    expect(second).toBe(false);

    // Version should still be correct
    expect(getCurrentVersion(db)).toBe(SCHEMA_VERSION);
  });

  it('should report needsMigration correctly', () => {
    expect(needsMigration(db)).toBe(true);
    migrate(db);
    expect(needsMigration(db)).toBe(false);
  });
});

describe('SpanWriter', () => {
  let db: Database.Database;
  let writer: SpanWriter;

  beforeEach(() => {
    db = new Database(':memory:');
    migrate(db);
    writer = new SpanWriter(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should write a single span', () => {
    const span = generateTestSpan();
    writer.writeSpan(span);

    const row = db.prepare('SELECT * FROM spans WHERE id = ?').get(span.id);
    expect(row).toBeDefined();
  });

  it('should write multiple spans in batch', () => {
    const spans = [generateTestSpan(), generateTestSpan(), generateTestSpan()];

    writer.writeSpans(spans);

    const count = db.prepare('SELECT COUNT(*) as count FROM spans').get() as { count: number };
    expect(count.count).toBe(3);
  });

  it('should handle empty batch', () => {
    writer.writeSpans([]);

    const count = db.prepare('SELECT COUNT(*) as count FROM spans').get() as { count: number };
    expect(count.count).toBe(0);
  });

  it('should startSpan and return ID', () => {
    const id = writer.startSpan({
      traceId: 'trace-1',
      sessionId: 'session-1',
      agentId: 'agent-1',
      spanType: 'session',
      name: 'Test Session',
      startTs: Date.now(),
    });

    expect(id).toBeDefined();
    expect(typeof id).toBe('string');
    expect(id.length).toBe(36); // UUID format

    const row = db.prepare('SELECT * FROM spans WHERE id = ?').get(id);
    expect(row).toBeDefined();
  });

  it('should endSpan with updates', () => {
    const startTs = Date.now();
    const id = writer.startSpan({
      traceId: 'trace-1',
      sessionId: 'session-1',
      agentId: 'agent-1',
      spanType: 'turn',
      name: 'Test Turn',
      startTs,
    });

    const endTs = startTs + 1000;
    writer.endSpan(id, {
      endTs,
      status: 'ok',
      costUsd: 0.005,
      tokensIn: 100,
      tokensOut: 50,
    });

    const row = db.prepare('SELECT * FROM spans WHERE id = ?').get(id) as {
      end_ts: number;
      status: string;
      cost_usd: number;
      tokens_in: number;
      tokens_out: number;
      duration_ms: number;
    };

    expect(row.end_ts).toBe(endTs);
    expect(row.status).toBe('ok');
    expect(row.cost_usd).toBe(0.005);
    expect(row.tokens_in).toBe(100);
    expect(row.tokens_out).toBe(50);
    expect(row.duration_ms).toBe(1000);
  });

  it('should update span with partial updates', () => {
    const span = generateTestSpan({ costUsd: 0 });
    writer.writeSpan(span);

    writer.updateSpan(span.id, {
      costUsd: 0.01,
      model: 'claude-opus-4',
    });

    const row = db.prepare('SELECT cost_usd, model FROM spans WHERE id = ?').get(span.id) as {
      cost_usd: number;
      model: string;
    };

    expect(row.cost_usd).toBe(0.01);
    expect(row.model).toBe('claude-opus-4');
  });

  it('should serialize metadata to JSON', () => {
    const span = generateTestSpan({
      metadata: {
        toolName: 'bash',
        toolArgsPreview: '{"command": "ls"}',
        nested: { value: 123 },
      },
    });

    writer.writeSpan(span);

    const row = db.prepare('SELECT metadata FROM spans WHERE id = ?').get(span.id) as {
      metadata: string;
    };

    const parsed = JSON.parse(row.metadata);
    expect(parsed.toolName).toBe('bash');
    expect(parsed.nested.value).toBe(123);
  });

  it('should record import', () => {
    writer.recordImport('/path/to/file.jsonl', 'abc123', 42);

    const row = db.prepare('SELECT * FROM imports WHERE file_path = ?').get('/path/to/file.jsonl') as {
      file_hash: string;
      spans_created: number;
    };

    expect(row.file_hash).toBe('abc123');
    expect(row.spans_created).toBe(42);
  });

  it('should check if file is imported', () => {
    expect(writer.isFileImported('/path/to/file.jsonl', 'abc123')).toBe(false);

    writer.recordImport('/path/to/file.jsonl', 'abc123', 10);
    expect(writer.isFileImported('/path/to/file.jsonl', 'abc123')).toBe(true);
    expect(writer.isFileImported('/path/to/file.jsonl', 'different-hash')).toBe(false);
  });
});

describe('SpanReader', () => {
  let db: Database.Database;
  let writer: SpanWriter;
  let reader: SpanReader;

  beforeEach(() => {
    db = new Database(':memory:');
    migrate(db);
    writer = new SpanWriter(db);
    reader = new SpanReader(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('getSpan', () => {
    it('should get span by ID', () => {
      const span = generateTestSpan();
      writer.writeSpan(span);

      const result = reader.getSpan(span.id);
      expect(result).not.toBeNull();
      expect(result!.id).toBe(span.id);
      expect(result!.spanType).toBe(span.spanType);
    });

    it('should return null for non-existent span', () => {
      const result = reader.getSpan('non-existent-id');
      expect(result).toBeNull();
    });

    it('should parse metadata JSON', () => {
      const span = generateTestSpan({
        metadata: { toolName: 'bash', count: 5 },
      });
      writer.writeSpan(span);

      const result = reader.getSpan(span.id);
      expect(result!.metadata).toEqual({ toolName: 'bash', count: 5 });
    });
  });

  describe('getSessionList', () => {
    beforeEach(() => {
      // Create multiple sessions
      for (let i = 0; i < 5; i++) {
        const { sessionSpan, turnSpans, toolSpans } = generateTestSession();
        writer.writeSpan(sessionSpan);
        writer.writeSpans(turnSpans);
        writer.writeSpans(toolSpans);
      }
    });

    it('should list all sessions', () => {
      const sessions = reader.getSessionList();
      expect(sessions.length).toBe(5);
    });

    it('should filter by agent ID', () => {
      // Add a different agent
      const differentAgent = generateTestSpan({
        agentId: 'other-agent',
        spanType: 'session',
      });
      writer.writeSpan(differentAgent);

      const sessions = reader.getSessionList({ agentId: 'test-agent' });
      expect(sessions.length).toBe(5);
      expect(sessions.every((s) => s.agentId === 'test-agent')).toBe(true);
    });

    it('should filter by status', () => {
      // Add an error session
      const errorSession = generateTestSpan({
        spanType: 'session',
        status: 'error',
      });
      writer.writeSpan(errorSession);

      const errorSessions = reader.getSessionList({ status: 'error' });
      expect(errorSessions.length).toBe(1);
    });

    it('should respect limit and offset', () => {
      const page1 = reader.getSessionList({ limit: 2, offset: 0 });
      const page2 = reader.getSessionList({ limit: 2, offset: 2 });

      expect(page1.length).toBe(2);
      expect(page2.length).toBe(2);
      expect(page1[0].sessionId).not.toBe(page2[0].sessionId);
    });

    it('should include aggregated statistics', () => {
      const sessions = reader.getSessionList();
      const session = sessions[0];

      expect(session.totalCost).toBeGreaterThan(0);
      expect(session.spanCount).toBeGreaterThan(0);
    });
  });

  describe('getSessionReplay', () => {
    it('should return spans ordered by start time', () => {
      const sessionId = randomUUID();
      const { sessionSpan, turnSpans, toolSpans } = generateTestSession(sessionId);

      writer.writeSpan(sessionSpan);
      writer.writeSpans(turnSpans);
      writer.writeSpans(toolSpans);

      const replay = reader.getSessionReplay(sessionId);

      // Should have all spans
      expect(replay.length).toBe(1 + turnSpans.length + toolSpans.length);

      // Should be ordered by start_ts
      for (let i = 1; i < replay.length; i++) {
        expect(replay[i].startTs).toBeGreaterThanOrEqual(replay[i - 1].startTs);
      }
    });

    it('should return empty array for non-existent session', () => {
      const replay = reader.getSessionReplay('non-existent');
      expect(replay).toEqual([]);
    });
  });

  describe('getSpanChildren', () => {
    it('should return child spans', () => {
      const sessionId = randomUUID();
      const { sessionSpan, turnSpans, toolSpans } = generateTestSession(sessionId);

      writer.writeSpan(sessionSpan);
      writer.writeSpans(turnSpans);
      writer.writeSpans(toolSpans);

      // Session should have turn children
      const sessionChildren = reader.getSpanChildren(sessionSpan.id);
      expect(sessionChildren.length).toBe(2);
      expect(sessionChildren.every((s) => s.spanType === 'turn')).toBe(true);

      // Turn 2 should have tool children
      const turn2 = turnSpans[1];
      const turnChildren = reader.getSpanChildren(turn2.id);
      expect(turnChildren.length).toBe(2);
      expect(turnChildren.every((s) => s.spanType === 'tool_exec')).toBe(true);
    });
  });

  describe('getSpanTree', () => {
    it('should build hierarchical tree structure', () => {
      const sessionId = randomUUID();
      const { sessionSpan, turnSpans, toolSpans } = generateTestSession(sessionId);

      writer.writeSpan(sessionSpan);
      writer.writeSpans(turnSpans);
      writer.writeSpans(toolSpans);

      const tree = reader.getSpanTree(sessionId);

      expect(tree).not.toBeNull();
      expect(tree!.spanType).toBe('session');
      expect(tree!.children.length).toBe(2); // 2 turns

      const turn2 = tree!.children.find((c) => c.name === 'Turn 2');
      expect(turn2).toBeDefined();
      expect(turn2!.children.length).toBe(2); // 2 tools
    });

    it('should return null for non-existent session', () => {
      const tree = reader.getSpanTree('non-existent');
      expect(tree).toBeNull();
    });
  });

  describe('getAnalytics', () => {
    beforeEach(() => {
      // Add varied data for analytics
      for (let i = 0; i < 3; i++) {
        const { sessionSpan, turnSpans, toolSpans } = generateTestSession();
        writer.writeSpan(sessionSpan);
        writer.writeSpans(turnSpans);
        writer.writeSpans(toolSpans);
      }

      // Add a session with different agent
      const otherAgentSession = generateTestSpan({
        spanType: 'session',
        agentId: 'other-agent',
        costUsd: 0.05,
      });
      writer.writeSpan(otherAgentSession);

      // Add llm_call spans for cost_by_model test
      for (let i = 0; i < 3; i++) {
        const llmCall = generateTestSpan({
          spanType: 'llm_call',
          model: i === 0 ? 'claude-sonnet-4' : 'claude-opus-4',
          costUsd: 0.01 * (i + 1),
        });
        writer.writeSpan(llmCall);
      }
    });

    it('should return cost by agent', () => {
      const result = reader.getAnalytics('cost_by_agent');

      expect(result.queryType).toBe('cost_by_agent');
      expect(result.data.length).toBeGreaterThan(0);
      expect(result.data[0]).toHaveProperty('label');
      expect(result.data[0]).toHaveProperty('value');
    });

    it('should return cost by model', () => {
      const result = reader.getAnalytics('cost_by_model');

      expect(result.queryType).toBe('cost_by_model');
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('should return latency by type', () => {
      const result = reader.getAnalytics('latency_by_type');

      expect(result.queryType).toBe('latency_by_type');
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('should return unknown query type gracefully', () => {
      const result = reader.getAnalytics('unknown_query');

      expect(result.queryType).toBe('unknown_query');
      expect(result.data).toEqual([]);
    });
  });

  describe('getTopology', () => {
    it('should return nodes and edges', () => {
      // Add sessions and delegations
      const parentSessionId = randomUUID();
      const childSessionId = randomUUID();

      const parentSession = generateTestSpan({
        sessionId: parentSessionId,
        agentId: 'parent-agent',
        spanType: 'session',
      });

      const delegation = generateTestSpan({
        sessionId: parentSessionId,
        agentId: 'parent-agent',
        spanType: 'delegation',
        metadata: {
          targetAgentId: 'child-agent',
          childSessionId,
        },
      });

      const childSession = generateTestSpan({
        sessionId: childSessionId,
        agentId: 'child-agent',
        spanType: 'session',
      });

      writer.writeSpan(parentSession);
      writer.writeSpan(delegation);
      writer.writeSpan(childSession);

      const topology = reader.getTopology();

      expect(topology.nodes.length).toBe(2);
      expect(topology.edges.length).toBe(1);
      expect(topology.edges[0].source).toBe('parent-agent');
      expect(topology.edges[0].target).toBe('child-agent');
    });
  });

  describe('findSpanForEnrichment', () => {
    it('should find span within time window', () => {
      const sessionId = randomUUID();
      const now = Date.now();

      const span = generateTestSpan({
        sessionId,
        spanType: 'turn',
        source: 'hook',
        startTs: now,
        tokensIn: 0, // Not yet enriched
      });

      writer.writeSpan(span);

      const found = reader.findSpanForEnrichment(sessionId, now + 1000, 'turn');
      expect(found).not.toBeNull();
      expect(found!.id).toBe(span.id);
    });

    it('should not find span outside time window', () => {
      const sessionId = randomUUID();
      const now = Date.now();

      const span = generateTestSpan({
        sessionId,
        spanType: 'turn',
        source: 'hook',
        startTs: now,
        tokensIn: 0,
      });

      writer.writeSpan(span);

      // Search 10 seconds later (outside 5s default window)
      const found = reader.findSpanForEnrichment(sessionId, now + 10000, 'turn');
      expect(found).toBeNull();
    });

    it('should not find already enriched spans', () => {
      const sessionId = randomUUID();
      const now = Date.now();

      const span = generateTestSpan({
        sessionId,
        spanType: 'turn',
        source: 'hook',
        startTs: now,
        tokensIn: 100, // Already enriched
      });

      writer.writeSpan(span);

      const found = reader.findSpanForEnrichment(sessionId, now, 'turn');
      expect(found).toBeNull();
    });
  });
});
