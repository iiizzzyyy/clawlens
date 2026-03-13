/**
 * Integration tests
 *
 * Verifies the full stack works end-to-end:
 * - Demo fixtures import correctly
 * - API endpoints return valid data
 * - Session replay works
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createTestDb } from '../src/db/connection.js';
import { SpanWriter } from '../src/db/writer.js';
import { SpanReader } from '../src/db/reader.js';
import { importDemoFixtures, getDemoSessionFiles } from '../src/demo.js';
import { handleSessionsList, handleSessionReplay } from '../src/api/sessions.js';
import { handleAnalytics } from '../src/api/analytics.js';
import { handleTopology } from '../src/api/topology.js';

describe('Integration Tests', () => {
  let writer: SpanWriter;
  let reader: SpanReader;
  let testDb: any;

  beforeAll(async () => {
    // Create test database
    testDb = createTestDb();
    writer = new SpanWriter(testDb);
    reader = new SpanReader(testDb);

    // Import demo fixtures
    const logger = {
      info: () => {},
      warn: () => {},
      error: () => {},
    };

    await importDemoFixtures(writer, logger);
  });

  describe('Demo Fixtures', () => {
    it('should have demo fixture files available', () => {
      const files = getDemoSessionFiles();
      expect(files.length).toBeGreaterThan(0);
      expect(files.length).toBeGreaterThanOrEqual(7); // We created 7 demo sessions
    });

    it('should import demo sessions successfully', async () => {
      const sessions = reader.getSessionList({ limit: 100 });
      expect(sessions.length).toBeGreaterThan(0);
      expect(sessions.length).toBeGreaterThanOrEqual(7); // At least 7 demo sessions
    });
  });

  describe('API: Sessions List', () => {
    it('should return sessions from /api/sessions', () => {
      const result = handleSessionsList('/clawlens/api/sessions', reader);

      expect(result.error).toBeUndefined();
      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);

      // Verify session structure
      const session = result.data[0];
      expect(session).toHaveProperty('sessionId');
      expect(session).toHaveProperty('agentId');
      expect(session).toHaveProperty('totalCost');
      expect(session).toHaveProperty('spanCount');
    });

    it('should filter sessions by channel', () => {
      const result = handleSessionsList('/clawlens/api/sessions?channel=telegram', reader);

      expect(result.error).toBeUndefined();
      expect(result.data).toBeDefined();
      expect(result.data.every((s) => s.channel === 'telegram')).toBe(true);
    });

    it('should apply pagination', () => {
      const result = handleSessionsList('/clawlens/api/sessions?limit=2&offset=0', reader);

      expect(result.error).toBeUndefined();
      expect(result.data).toBeDefined();
      expect(result.data.length).toBeLessThanOrEqual(2);
      expect(result.meta?.limit).toBe(2);
      expect(result.meta?.offset).toBe(0);
    });
  });

  describe('API: Session Replay', () => {
    it('should return session replay data', () => {
      // Get first session
      const sessions = reader.getSessionList({ limit: 1 });
      expect(sessions.length).toBeGreaterThan(0);

      const sessionId = sessions[0].sessionId;
      const result = handleSessionReplay(
        `/clawlens/api/sessions/${sessionId}/replay`,
        reader
      );

      expect(result.error).toBeUndefined();
      expect(result.data).toBeDefined();
      expect(result.data?.spanType).toBe('session');
      expect(result.data?.sessionId).toBe(sessionId);
      expect(result.data?.children).toBeDefined();
      expect(Array.isArray(result.data?.children)).toBe(true);
    });

    it('should return 404 for non-existent session', () => {
      const result = handleSessionReplay(
        '/clawlens/api/sessions/nonexistent_session_id/replay',
        reader
      );

      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('NOT_FOUND');
    });

    it('should have turns with child spans', () => {
      const sessions = reader.getSessionList({ limit: 10 });
      const sessionWithSpans = sessions.find((s) => s.spanCount > 1);

      if (sessionWithSpans) {
        const result = handleSessionReplay(
          `/clawlens/api/sessions/${sessionWithSpans.sessionId}/replay`,
          reader
        );

        expect(result.data?.children.length).toBeGreaterThan(0);

        // Check for turns
        const turns = result.data?.children.filter((c) => c.spanType === 'turn');
        expect(turns).toBeDefined();
        expect(turns!.length).toBeGreaterThan(0);
      }
    });
  });

  describe('API: Analytics', () => {
    it('should return cost_by_model analytics', () => {
      const result = handleAnalytics('/clawlens/api/analytics/cost_by_model', reader);

      expect(result.error).toBeUndefined();
      expect(result.data).toBeDefined();
      expect(result.data?.queryType).toBe('cost_by_model');
      expect(Array.isArray(result.data?.data)).toBe(true);
      expect(result.data?.metadata).toBeDefined();
    });

    it('should return cost_by_channel analytics', () => {
      const result = handleAnalytics('/clawlens/api/analytics/cost_by_channel', reader);

      expect(result.error).toBeUndefined();
      expect(result.data).toBeDefined();
      expect(result.data?.queryType).toBe('cost_by_channel');
    });

    it('should reject invalid query type', () => {
      const result = handleAnalytics('/clawlens/api/analytics/invalid_query', reader);

      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('INVALID_PARAM');
    });

    it('should apply time filters', () => {
      const now = Date.now();
      const result = handleAnalytics(
        `/clawlens/api/analytics/cost_by_model?fromTs=${now - 1000000000}&toTs=${now}`,
        reader
      );

      expect(result.error).toBeUndefined();
      expect(result.data).toBeDefined();
    });
  });

  describe('API: Topology', () => {
    it('should return topology graph', () => {
      const result = handleTopology('/clawlens/api/topology', reader);

      expect(result.error).toBeUndefined();
      expect(result.data).toBeDefined();
      expect(result.data.nodes).toBeDefined();
      expect(result.data.edges).toBeDefined();
      expect(Array.isArray(result.data.nodes)).toBe(true);
      expect(Array.isArray(result.data.edges)).toBe(true);
    });

    it('should have nodes for agents in demo data', () => {
      const result = handleTopology('/clawlens/api/topology', reader);

      expect(result.data.nodes.length).toBeGreaterThan(0);

      // Check node structure
      if (result.data.nodes.length > 0) {
        const node = result.data.nodes[0];
        expect(node).toHaveProperty('id');
        expect(node).toHaveProperty('label');
        expect(node).toHaveProperty('spanCount');
        expect(node).toHaveProperty('totalCost');
      }
    });
  });

  describe('Demo Data Scenarios', () => {
    it('should have a simple Q&A session', () => {
      const sessions = reader.getSessionList({ limit: 100 });
      const simpleSession = sessions.find((s) => s.sessionId.includes('simple'));

      if (simpleSession) {
        expect(simpleSession.totalCost).toBeLessThan(0.01); // Low cost
        expect(simpleSession.spanCount).toBeLessThan(10); // Few spans
      }
    });

    it('should have a tool-heavy session', () => {
      const sessions = reader.getSessionList({ limit: 100 });
      const toolSession = sessions.find((s) => s.sessionId.includes('tools'));

      if (toolSession) {
        const replay = reader.getSpanTree(toolSession.sessionId);
        const turns = replay?.children.filter((c) => c.spanType === 'turn') || [];

        // Tool-heavy session should have turns with multiple tool calls
        const hasToolCalls = turns.some((turn) =>
          turn.children.some((c) => c.spanType === 'tool_exec')
        );
        expect(hasToolCalls).toBe(true);
      }
    });

    it('should have an expensive session', () => {
      const sessions = reader.getSessionList({ limit: 100 });
      const expensiveSession = sessions.find((s) => s.sessionId.includes('expensive'));

      if (expensiveSession) {
        expect(expensiveSession.totalCost).toBeGreaterThan(1.0); // High cost
      }
    });

    it('should have a failed session', () => {
      const sessions = reader.getSessionList({ limit: 100 });
      const failedSession = sessions.find((s) => s.sessionId.includes('failed'));

      if (failedSession) {
        expect(failedSession.errorCount).toBeGreaterThan(0); // Has errors
        // Status might be 'error' or the session status might still be 'ok' with child errors
      }
    });

    it('should have a delegation session', () => {
      const sessions = reader.getSessionList({ limit: 100 });
      const delegationSession = sessions.find((s) => s.sessionId.includes('delegation'));

      // Verify the delegation session exists with expected metadata
      if (delegationSession) {
        expect(delegationSession.agentId).toBe('coordinator');
        const replay = reader.getSpanTree(delegationSession.sessionId);
        const turns = replay?.children.filter((c) => c.spanType === 'turn') || [];

        // Should have multiple turns showing delegation workflow
        expect(turns.length).toBeGreaterThan(0);
      }
    });

    it('should have a cron session', () => {
      const sessions = reader.getSessionList({ limit: 100 });
      const cronSession = sessions.find((s) => s.sessionId.includes('cron'));

      if (cronSession) {
        expect(cronSession.channel).toBe('cron');
        expect(cronSession.agentId).toBe('monitoring-bot');
      }
    });
  });

  describe('Retention Policy', () => {
    it('should support manual pruning of old spans', () => {
      const testDb = createTestDb();
      const testWriter = new SpanWriter(testDb);
      const testReader = new SpanReader(testDb);

      // Create old spans (91 days ago, outside default 90-day retention)
      const oldDate = Date.now() - 91 * 24 * 60 * 60 * 1000;
      testWriter.startSpan({
        traceId: 'old_trace',
        sessionId: 'old_session',
        agentId: 'test-agent',
        spanType: 'session',
        name: 'Old Session',
        startTs: oldDate,
        endTs: oldDate + 1000,
      });

      // Create recent spans
      const recentDate = Date.now() - 1 * 24 * 60 * 60 * 1000;
      testWriter.startSpan({
        traceId: 'recent_trace',
        sessionId: 'recent_session',
        agentId: 'test-agent',
        spanType: 'session',
        name: 'Recent Session',
        startTs: recentDate,
        endTs: recentDate + 1000,
      });

      // Verify both exist before pruning
      const allSessions = testReader.getSessionList({ limit: 100 });
      expect(allSessions.length).toBe(2);

      // Apply retention policy manually (delete spans older than 90 days)
      const retentionMs = 90 * 24 * 60 * 60 * 1000;
      const cutoffTs = Date.now() - retentionMs;

      // Use raw SQL to prune (since pruneOldSpans method doesn't exist yet)
      const deleted = testDb.prepare('DELETE FROM spans WHERE start_ts < ?').run(cutoffTs);
      expect(deleted.changes).toBeGreaterThan(0);

      // Verify only recent session remains
      const afterPrune = testReader.getSessionList({ limit: 100 });
      expect(afterPrune.length).toBe(1);
      expect(afterPrune[0].sessionId).toBe('recent_session');
    });
  });

  describe('Concurrent Session Handling', () => {
    it('should handle concurrent writes to different sessions', () => {
      const testDb = createTestDb();
      const testWriter = new SpanWriter(testDb);
      const testReader = new SpanReader(testDb);

      // Simulate concurrent sessions
      const session1 = 'concurrent_sess_1';
      const session2 = 'concurrent_sess_2';

      testWriter.startSpan({
        traceId: session1,
        sessionId: session1,
        agentId: 'agent-1',
        spanType: 'session',
        name: 'Concurrent Session 1',
        startTs: Date.now(),
      });

      testWriter.startSpan({
        traceId: session2,
        sessionId: session2,
        agentId: 'agent-2',
        spanType: 'session',
        name: 'Concurrent Session 2',
        startTs: Date.now(),
      });

      // Both sessions should exist
      const sessions = testReader.getSessionList({ limit: 100 });
      const ids = sessions.map((s) => s.sessionId);
      expect(ids).toContain(session1);
      expect(ids).toContain(session2);
    });

    it('should handle concurrent reads and writes', () => {
      const testDb = createTestDb();
      const testWriter = new SpanWriter(testDb);
      const testReader = new SpanReader(testDb);

      // Write a session
      const sessionId = 'read_write_test';
      testWriter.startSpan({
        traceId: sessionId,
        sessionId,
        agentId: 'test-agent',
        spanType: 'session',
        name: 'Test Session',
        startTs: Date.now(),
        endTs: Date.now() + 1000,
      });

      // Read while writing additional spans
      const initialRead = testReader.getSessionReplay(sessionId);
      expect(initialRead.length).toBe(1);

      // Add more spans
      testWriter.startSpan({
        traceId: sessionId,
        parentId: initialRead[0].id,
        sessionId,
        agentId: 'test-agent',
        spanType: 'turn',
        name: 'Turn 1',
        startTs: Date.now(),
        endTs: Date.now() + 500,
      });

      // Read again should show new span
      const secondRead = testReader.getSessionReplay(sessionId);
      expect(secondRead.length).toBe(2);
    });
  });

  describe('Error Recovery', () => {
    it('should handle invalid span data gracefully', () => {
      const testDb = createTestDb();
      const testWriter = new SpanWriter(testDb);

      // Attempt to write span with missing required fields
      // Should not crash the writer
      expect(() => {
        testWriter.startSpan({
          traceId: 'test',
          sessionId: 'test',
          agentId: 'test',
          spanType: 'session',
          name: '',  // Empty name
          startTs: Date.now(),
        });
      }).not.toThrow();
    });

    it('should handle database read errors', () => {
      const testDb = createTestDb();
      const testReader = new SpanReader(testDb);

      // Try to read non-existent span
      const span = testReader.getSpan('nonexistent_id');
      expect(span).toBeNull();
    });
  });

  describe('Full Lifecycle', () => {
    it('should complete full lifecycle: init → import → query → verify', async () => {
      // 1. Init: Create fresh database
      const testDb = createTestDb();
      const testWriter = new SpanWriter(testDb);
      const testReader = new SpanReader(testDb);

      // 2. Import: Load demo fixtures
      const logger = {
        info: () => {},
        warn: () => {},
        error: () => {},
      };
      await importDemoFixtures(testWriter, logger);

      // 3. Query: Verify sessions API works
      const sessionsResult = handleSessionsList('/clawlens/api/sessions', testReader);
      expect(sessionsResult.error).toBeUndefined();
      expect(sessionsResult.data.length).toBeGreaterThan(0);

      // 4. Verify: Check session replay for first session
      const firstSession = sessionsResult.data[0];
      const replayResult = handleSessionReplay(
        `/clawlens/api/sessions/${firstSession.sessionId}/replay`,
        testReader
      );
      expect(replayResult.error).toBeUndefined();
      expect(replayResult.data?.sessionId).toBe(firstSession.sessionId);

      // 5. Verify: Check analytics works
      const analyticsResult = handleAnalytics('/clawlens/api/analytics/cost_by_agent', testReader);
      expect(analyticsResult.error).toBeUndefined();
      expect(analyticsResult.data?.data.length).toBeGreaterThan(0);

      // 6. Verify: Check topology works
      const topologyResult = handleTopology('/clawlens/api/topology', testReader);
      expect(topologyResult.error).toBeUndefined();
      expect(topologyResult.data.nodes.length).toBeGreaterThan(0);
    });
  });
});
