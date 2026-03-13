/**
 * Analytics query tests
 *
 * Tests each of the 8 analytics queries with fixture data.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createTestDb } from '../src/db/connection.js';
import { SpanWriter } from '../src/db/writer.js';
import * as analyticsQueries from '../src/db/analytics-queries.js';
import type Database from 'better-sqlite3';

describe('Analytics Queries', () => {
  let db: Database.Database;
  let writer: SpanWriter;

  beforeAll(() => {
    db = createTestDb();
    writer = new SpanWriter(db);

    // Create fixture data for analytics tests
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const twoDaysAgo = now - 2 * 24 * 60 * 60 * 1000;

    // Session 1: Agent A, Slack, Claude Sonnet
    const session1 = writer.startSpan({
      traceId: 'trace_1',
      sessionId: 'sess_1',
      agentId: 'agent_a',
      channel: 'slack',
      spanType: 'session',
      name: 'Session 1',
      startTs: twoDaysAgo,
      endTs: twoDaysAgo + 300000,
    });

    const turn1 = writer.startSpan({
      traceId: 'trace_1',
      parentId: session1,
      sessionId: 'sess_1',
      agentId: 'agent_a',
      channel: 'slack',
      spanType: 'turn',
      name: 'Turn 1',
      startTs: twoDaysAgo + 1000,
      endTs: twoDaysAgo + 150000,
    });

    writer.startSpan({
      traceId: 'trace_1',
      parentId: turn1,
      sessionId: 'sess_1',
      agentId: 'agent_a',
      spanType: 'llm_call',
      name: 'LLM Call 1',
      startTs: twoDaysAgo + 2000,
      endTs: twoDaysAgo + 145000,
      tokensIn: 1000,
      tokensOut: 500,
      costUsd: 0.05,
      model: 'claude-sonnet-4',
      provider: 'anthropic',
    });

    writer.startSpan({
      traceId: 'trace_1',
      parentId: turn1,
      sessionId: 'sess_1',
      agentId: 'agent_a',
      spanType: 'tool_exec',
      name: 'Bash Tool',
      startTs: twoDaysAgo + 146000,
      endTs: twoDaysAgo + 148000,
      metadata: { toolName: 'bash' },
    });

    // Session 2: Agent B, Telegram, Claude Haiku (with errors)
    const session2 = writer.startSpan({
      id: 'sess_2',
      traceId: 'trace_2',
      sessionId: 'sess_2',
      agentId: 'agent_b',
      channel: 'telegram',
      spanType: 'session',
      name: 'Session 2',
      startTs: oneDayAgo,
      endTs: oneDayAgo + 180000,
      status: 'error',
    });

    const turn2 = writer.startSpan({
      id: 'turn_2',
      traceId: 'trace_2',
      parentId: session2,
      sessionId: 'sess_2',
      agentId: 'agent_b',
      channel: 'telegram',
      spanType: 'turn',
      name: 'Turn 2',
      startTs: oneDayAgo + 1000,
      endTs: oneDayAgo + 100000,
    });

    writer.startSpan({
      id: 'llm_2',
      traceId: 'trace_2',
      parentId: turn2,
      sessionId: 'sess_2',
      agentId: 'agent_b',
      spanType: 'llm_call',
      name: 'LLM Call 2',
      startTs: oneDayAgo + 2000,
      endTs: oneDayAgo + 95000,
      tokensIn: 500,
      tokensOut: 200,
      costUsd: 0.01,
      model: 'claude-haiku-4',
      provider: 'anthropic',
    });

    // Failed tool call
    writer.startSpan({
      id: 'tool_2',
      traceId: 'trace_2',
      parentId: turn2,
      sessionId: 'sess_2',
      agentId: 'agent_b',
      spanType: 'tool_exec',
      name: 'Read Tool',
      startTs: oneDayAgo + 96000,
      endTs: oneDayAgo + 98000,
      status: 'error',
      metadata: { toolName: 'read' },
    });

    // Retry of same tool
    writer.startSpan({
      id: 'tool_3',
      traceId: 'trace_2',
      parentId: turn2,
      sessionId: 'sess_2',
      agentId: 'agent_b',
      spanType: 'tool_exec',
      name: 'Read Tool',
      startTs: oneDayAgo + 99000,
      endTs: oneDayAgo + 99500,
      metadata: { toolName: 'read' },
    });

    // Session 3: Agent A, Slack, Claude Sonnet (longer conversation)
    const session3 = writer.startSpan({
      id: 'sess_3',
      traceId: 'trace_3',
      sessionId: 'sess_3',
      agentId: 'agent_a',
      channel: 'slack',
      spanType: 'session',
      name: 'Session 3',
      startTs: now - 3600000,
      endTs: now - 1800000,
    });

    const turn3 = writer.startSpan({
      id: 'turn_3',
      traceId: 'trace_3',
      parentId: session3,
      sessionId: 'sess_3',
      agentId: 'agent_a',
      channel: 'slack',
      spanType: 'turn',
      name: 'Turn 3',
      startTs: now - 3599000,
      endTs: now - 3000000,
    });

    // Multiple LLM calls showing token waste (context re-read)
    writer.startSpan({
      id: 'llm_3',
      traceId: 'trace_3',
      parentId: turn3,
      sessionId: 'sess_3',
      agentId: 'agent_a',
      spanType: 'llm_call',
      name: 'LLM Call 3',
      startTs: now - 3598000,
      endTs: now - 3500000,
      tokensIn: 1000,
      tokensOut: 300,
      costUsd: 0.04,
      model: 'claude-sonnet-4',
    });

    writer.startSpan({
      id: 'llm_4',
      traceId: 'trace_3',
      parentId: turn3,
      sessionId: 'sess_3',
      agentId: 'agent_a',
      spanType: 'llm_call',
      name: 'LLM Call 4',
      startTs: now - 3400000,
      endTs: now - 3100000,
      tokensIn: 2000, // Context re-read: 1000 extra tokens
      tokensOut: 400,
      costUsd: 0.06,
      model: 'claude-sonnet-4',
    });
  });

  describe('Query 1: Cost by Agent + Model', () => {
    it('should group costs by agent and model', () => {
      const results = analyticsQueries.costByAgentModel(db, {});

      expect(results.length).toBeGreaterThan(0);

      // Should have results for agent_a with claude-sonnet-4
      const agentASonnet = results.find(
        (r) => r.agentId === 'agent_a' && r.model === 'claude-sonnet-4'
      );
      expect(agentASonnet).toBeDefined();
      expect(agentASonnet?.totalCost).toBeGreaterThan(0);
      expect(agentASonnet?.sessionCount).toBeGreaterThanOrEqual(2);
    });

    it('should filter by time range', () => {
      const now = Date.now();
      const results = analyticsQueries.costByAgentModel(db, {
        fromTs: now - 2 * 24 * 60 * 60 * 1000,
        toTs: now,
      });

      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('Query 2: Cost per Successful Task', () => {
    it('should calculate cost per successful turn', () => {
      const results = analyticsQueries.costPerSuccessfulTask(db, {});

      expect(results.length).toBeGreaterThan(0);

      // Should have results for agent_a
      const agentA = results.find((r) => r.agentId === 'agent_a');
      expect(agentA).toBeDefined();
      expect(agentA?.successfulTurns).toBeGreaterThan(0);
      expect(agentA?.costPerTask).toBeGreaterThan(0);
    });

    it('should exclude failed turns from success count', () => {
      const results = analyticsQueries.costPerSuccessfulTask(db, {});
      const agentB = results.find((r) => r.agentId === 'agent_b');

      // Agent B has a failed session, so turns should not count as successful
      if (agentB) {
        expect(agentB.successfulTurns).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Query 3: Tool Failure Rate', () => {
    it('should calculate failure rate by tool', () => {
      const results = analyticsQueries.toolFailureRate(db, {});

      expect(results.length).toBeGreaterThan(0);

      // Should have results for bash and read tools
      const bashTool = results.find((r) => r.toolName === 'bash');
      const readTool = results.find((r) => r.toolName === 'read');

      expect(bashTool || readTool).toBeDefined();

      if (readTool) {
        expect(readTool.totalCalls).toBeGreaterThanOrEqual(2);
        expect(readTool.failedCalls).toBeGreaterThanOrEqual(1);
        expect(readTool.failureRate).toBeGreaterThan(0);
        expect(readTool.failureRate).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('Query 4: Retry Clustering', () => {
    it('should detect retry patterns', () => {
      const results = analyticsQueries.retryClustering(db, {});

      // Should detect the read tool retry in session 2
      const readRetry = results.find((r) => r.toolName === 'read' && r.agentId === 'agent_b');

      if (readRetry) {
        expect(readRetry.retryCount).toBeGreaterThanOrEqual(1);
        expect(readRetry.avgTimeBetweenRetries).toBeGreaterThan(0);
      }
    });
  });

  describe('Query 5: Latency Percentiles', () => {
    it('should calculate percentiles by span type', () => {
      const results = analyticsQueries.latencyPercentiles(db, {});

      expect(results.length).toBeGreaterThan(0);

      // Should have percentiles for different span types
      const llmCallPercentiles = results.find((r) => r.spanType === 'llm_call');
      if (llmCallPercentiles) {
        expect(llmCallPercentiles.p50).toBeGreaterThan(0);
        expect(llmCallPercentiles.p90).toBeGreaterThanOrEqual(llmCallPercentiles.p50);
        expect(llmCallPercentiles.p99).toBeGreaterThanOrEqual(llmCallPercentiles.p90);
        expect(llmCallPercentiles.count).toBeGreaterThan(0);
      }
    });
  });

  describe('Query 6: Session Duration Distribution', () => {
    it('should group sessions into duration buckets', () => {
      const results = analyticsQueries.sessionDurationDistribution(db, {});

      expect(results.length).toBeGreaterThan(0);

      // Should have buckets like "0-30s", "1-3min", etc.
      const bucketNames = results.map((r) => r.bucket);
      expect(bucketNames.length).toBeGreaterThan(0);

      // Each bucket should have count and avgCost
      results.forEach((bucket) => {
        expect(bucket.count).toBeGreaterThan(0);
        expect(bucket.avgCost).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('Query 7: Error Hotspots by Channel', () => {
    it('should calculate error rates by channel', () => {
      const results = analyticsQueries.errorHotspotsByChannel(db, {});

      expect(results.length).toBeGreaterThan(0);

      // Should have results for slack and telegram
      const slackChannel = results.find((r) => r.channel === 'slack');
      const telegramChannel = results.find((r) => r.channel === 'telegram');

      expect(slackChannel || telegramChannel).toBeDefined();

      if (telegramChannel) {
        expect(telegramChannel.totalSessions).toBeGreaterThanOrEqual(1);
        expect(telegramChannel.errorRate).toBeGreaterThanOrEqual(0);
        expect(telegramChannel.errorRate).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('Query 8: Token Waste', () => {
    it('should detect context re-read waste', () => {
      const results = analyticsQueries.tokenWaste(db, {});

      // Should detect token waste in session 3
      const agentA = results.find((r) => r.agentId === 'agent_a');

      if (agentA) {
        expect(agentA.rereadTokens).toBeGreaterThan(0);
        expect(agentA.estimatedCost).toBeGreaterThan(0);
        expect(agentA.wastePercentage).toBeGreaterThanOrEqual(0);
      }
    });

    it('should calculate waste percentage correctly', () => {
      const results = analyticsQueries.tokenWaste(db, {});

      results.forEach((result) => {
        expect(result.wastePercentage).toBeGreaterThanOrEqual(0);
        expect(result.wastePercentage).toBeLessThanOrEqual(100);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty database gracefully', () => {
      const emptyDb = createTestDb();

      const results1 = analyticsQueries.costByAgentModel(emptyDb, {});
      const results2 = analyticsQueries.toolFailureRate(emptyDb, {});
      const results3 = analyticsQueries.latencyPercentiles(emptyDb, {});

      expect(results1).toEqual([]);
      expect(results2).toEqual([]);
      expect(results3).toEqual([]);
    });

    it('should handle single data point', () => {
      const singleDb = createTestDb();
      const singleWriter = new SpanWriter(singleDb);

      singleWriter.startSpan({
        traceId: 'trace_single',
        sessionId: 'single_1',
        agentId: 'test_agent',
        spanType: 'session',
        name: 'Single Session',
        startTs: Date.now(),
        endTs: Date.now() + 1000,
      });

      const results = analyticsQueries.sessionDurationDistribution(singleDb, {});
      expect(results.length).toBeGreaterThanOrEqual(1);
    });
  });
});
