/**
 * Topology graph tests
 *
 * Tests topology graph construction for multi-agent and single-agent scenarios.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createTestDb } from '../src/db/connection.js';
import { SpanWriter } from '../src/db/writer.js';
import { buildTopologyGraph } from '../src/db/topology.js';
import type Database from 'better-sqlite3';

describe('Topology Graph', () => {
  describe('Multi-Agent Scenario', () => {
    let db: Database.Database;
    let writer: SpanWriter;

    beforeAll(() => {
      db = createTestDb();
      writer = new SpanWriter(db);

      const now = Date.now();

      // Create sessions for Agent A
      writer.startSpan({
        traceId: 'trace_1',
        sessionId: 'sess_a_1',
        agentId: 'agent_a',
        channel: 'slack',
        spanType: 'session',
        name: 'Session A1',
        startTs: now - 10000,
        endTs: now - 5000,
        costUsd: 0.5,
      });

      writer.startSpan({
        traceId: 'trace_2',
        sessionId: 'sess_a_2',
        agentId: 'agent_a',
        channel: 'slack',
        spanType: 'session',
        name: 'Session A2',
        startTs: now - 9000,
        endTs: now - 4000,
        costUsd: 0.3,
        status: 'error',
      });

      // Create sessions for Agent B
      writer.startSpan({
        traceId: 'trace_3',
        sessionId: 'sess_b_1',
        agentId: 'agent_b',
        channel: 'telegram',
        spanType: 'session',
        name: 'Session B1',
        startTs: now - 8000,
        endTs: now - 3000,
        costUsd: 0.2,
      });

      // Create delegation spans (Agent A delegates to Agent B)
      writer.startSpan({
        traceId: 'trace_1',
        parentId: 'sess_a_1',
        sessionId: 'sess_a_1',
        agentId: 'agent_a',
        spanType: 'delegation',
        name: 'Delegate to B',
        startTs: now - 9500,
        endTs: now - 9000,
        metadata: { targetAgentId: 'agent_b' },
      });

      writer.startSpan({
        traceId: 'trace_1',
        parentId: 'sess_a_1',
        sessionId: 'sess_a_1',
        agentId: 'agent_a',
        spanType: 'delegation',
        name: 'Delegate to B again',
        startTs: now - 8500,
        endTs: now - 8000,
        status: 'error',
        metadata: { targetAgentId: 'agent_b' },
      });

      // Create sessions for Agent C
      writer.startSpan({
        traceId: 'trace_4',
        sessionId: 'sess_c_1',
        agentId: 'agent_c',
        channel: 'discord',
        spanType: 'session',
        name: 'Session C1',
        startTs: now - 7000,
        endTs: now - 2000,
        costUsd: 0.4,
      });

      // Agent B delegates to Agent C
      writer.startSpan({
        traceId: 'trace_3',
        parentId: 'sess_b_1',
        sessionId: 'sess_b_1',
        agentId: 'agent_b',
        spanType: 'delegation',
        name: 'Delegate to C',
        startTs: now - 7500,
        endTs: now - 7000,
        metadata: { targetAgentId: 'agent_c' },
      });
    });

    it('should build multi-agent topology graph', () => {
      const topology = buildTopologyGraph(db, {});

      expect(topology.nodes.length).toBe(3);
      expect(topology.edges.length).toBeGreaterThan(0);

      // Check nodes
      const agentA = topology.nodes.find((n) => n.id === 'agent_a');
      const agentB = topology.nodes.find((n) => n.id === 'agent_b');
      const agentC = topology.nodes.find((n) => n.id === 'agent_c');

      expect(agentA).toBeDefined();
      expect(agentB).toBeDefined();
      expect(agentC).toBeDefined();

      expect(agentA?.totalCost).toBe(0.8); // 0.5 + 0.3
      expect(agentA?.spanCount).toBe(2);
      expect(agentA?.errorCount).toBe(1);
    });

    it('should have delegation edges with correct status', () => {
      const topology = buildTopologyGraph(db, {});

      // Agent A → Agent B edge
      const edgeAB = topology.edges.find((e) => e.source === 'agent_a' && e.target === 'agent_b');
      expect(edgeAB).toBeDefined();
      expect(edgeAB?.count).toBe(2);
      expect(edgeAB?.status).toBe('mixed'); // 1 success, 1 error

      // Agent B → Agent C edge
      const edgeBC = topology.edges.find((e) => e.source === 'agent_b' && e.target === 'agent_c');
      expect(edgeBC).toBeDefined();
      expect(edgeBC?.count).toBe(1);
      expect(edgeBC?.status).toBe('ok');
    });

    it('should filter by time range', () => {
      const now = Date.now();
      const topology = buildTopologyGraph(db, {
        fromTs: now - 8500,
        toTs: now,
      });

      // Should have at least 2 agents in this narrower range
      expect(topology.nodes.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter by agent', () => {
      const topology = buildTopologyGraph(db, {
        agentId: 'agent_a',
      });

      // Should only include agent_a
      const agentIds = topology.nodes.map((n) => n.id);
      expect(agentIds).toContain('agent_a');
      expect(agentIds.length).toBe(1);
    });
  });

  describe('Single-Agent Scenario (Channel Flow)', () => {
    let db: Database.Database;
    let writer: SpanWriter;

    beforeAll(() => {
      db = createTestDb();
      writer = new SpanWriter(db);

      const now = Date.now();

      // Create sessions for single agent across multiple channels
      writer.startSpan({
        traceId: 'trace_1',
        sessionId: 'sess_1',
        agentId: 'main_agent',
        channel: 'slack',
        spanType: 'session',
        name: 'Slack Session 1',
        startTs: now - 10000,
        endTs: now - 5000,
        costUsd: 0.3,
      });

      writer.startSpan({
        traceId: 'trace_2',
        sessionId: 'sess_2',
        agentId: 'main_agent',
        channel: 'slack',
        spanType: 'session',
        name: 'Slack Session 2',
        startTs: now - 9000,
        endTs: now - 4000,
        costUsd: 0.2,
      });

      writer.startSpan({
        traceId: 'trace_3',
        sessionId: 'sess_3',
        agentId: 'main_agent',
        channel: 'telegram',
        spanType: 'session',
        name: 'Telegram Session',
        startTs: now - 8000,
        endTs: now - 3000,
        costUsd: 0.4,
        status: 'error',
      });

      writer.startSpan({
        traceId: 'trace_4',
        sessionId: 'sess_4',
        agentId: 'main_agent',
        channel: 'discord',
        spanType: 'session',
        name: 'Discord Session',
        startTs: now - 7000,
        endTs: now - 2000,
        costUsd: 0.1,
      });
    });

    it('should build channel-flow graph for single agent', () => {
      const topology = buildTopologyGraph(db, {});

      // Should have 1 agent node + 3 channel nodes
      expect(topology.nodes.length).toBe(4);

      // Check agent node
      const agentNode = topology.nodes.find((n) => n.id === 'main_agent');
      expect(agentNode).toBeDefined();
      expect(agentNode?.totalCost).toBe(1.0); // 0.3 + 0.2 + 0.4 + 0.1

      // Check channel nodes
      const slackNode = topology.nodes.find((n) => n.id === 'channel_slack');
      const telegramNode = topology.nodes.find((n) => n.id === 'channel_telegram');
      const discordNode = topology.nodes.find((n) => n.id === 'channel_discord');

      expect(slackNode).toBeDefined();
      expect(telegramNode).toBeDefined();
      expect(discordNode).toBeDefined();

      expect(slackNode?.spanCount).toBe(2);
      expect(telegramNode?.spanCount).toBe(1);
      expect(discordNode?.spanCount).toBe(1);
    });

    it('should have edges from channels to agent', () => {
      const topology = buildTopologyGraph(db, {});

      // Should have 3 edges (one per channel)
      expect(topology.edges.length).toBe(3);

      // Slack → Agent edge
      const slackEdge = topology.edges.find(
        (e) => e.source === 'channel_slack' && e.target === 'main_agent'
      );
      expect(slackEdge).toBeDefined();
      expect(slackEdge?.count).toBe(2);
      expect(slackEdge?.status).toBe('ok'); // No errors from slack

      // Telegram → Agent edge (has error)
      const telegramEdge = topology.edges.find(
        (e) => e.source === 'channel_telegram' && e.target === 'main_agent'
      );
      expect(telegramEdge).toBeDefined();
      expect(telegramEdge?.count).toBe(1);
      expect(telegramEdge?.status).toBe('error'); // 100% error rate
    });
  });

  describe('Empty State', () => {
    it('should handle empty database', () => {
      const emptyDb = createTestDb();
      const topology = buildTopologyGraph(emptyDb, {});

      expect(topology.nodes).toEqual([]);
      expect(topology.edges).toEqual([]);
      expect(topology.metadata).toBeDefined();
    });

    it('should handle no delegations (single agent with no delegations)', () => {
      const db = createTestDb();
      const writer = new SpanWriter(db);

      writer.startSpan({
        traceId: 'trace_1',
        sessionId: 'sess_1',
        agentId: 'solo_agent',
        channel: 'slack',
        spanType: 'session',
        name: 'Solo Session',
        startTs: Date.now(),
        endTs: Date.now() + 1000,
      });

      const topology = buildTopologyGraph(db, {});

      // Should have channel-flow graph
      expect(topology.nodes.length).toBeGreaterThan(0);
      expect(topology.edges.length).toBeGreaterThan(0);
    });

    it('should handle time range with no data', () => {
      const db = createTestDb();
      const writer = new SpanWriter(db);

      const pastTime = Date.now() - 1000000;
      writer.startSpan({
        traceId: 'trace_1',
        sessionId: 'sess_1',
        agentId: 'agent',
        spanType: 'session',
        name: 'Old Session',
        startTs: pastTime,
        endTs: pastTime + 1000,
      });

      const futureTime = Date.now() + 1000000;
      const topology = buildTopologyGraph(db, {
        fromTs: futureTime,
        toTs: futureTime + 1000,
      });

      expect(topology.nodes).toEqual([]);
      expect(topology.edges).toEqual([]);
    });
  });

  describe('Edge Status Classification', () => {
    let db: Database.Database;
    let writer: SpanWriter;

    beforeAll(() => {
      db = createTestDb();
      writer = new SpanWriter(db);

      const now = Date.now();

      // Agent A
      writer.startSpan({
        traceId: 'trace_1',
        sessionId: 'sess_1',
        agentId: 'agent_a',
        spanType: 'session',
        name: 'Session 1',
        startTs: now,
        endTs: now + 1000,
      });

      // Agent B
      writer.startSpan({
        traceId: 'trace_2',
        sessionId: 'sess_2',
        agentId: 'agent_b',
        spanType: 'session',
        name: 'Session 2',
        startTs: now,
        endTs: now + 1000,
      });

      // Create delegations with different error patterns

      // Mostly OK (1 error out of 10 = 10% error rate) → should be 'mixed'
      for (let i = 0; i < 9; i++) {
        writer.startSpan({
          traceId: `trace_ok_${i}`,
          sessionId: 'sess_1',
          agentId: 'agent_a',
          spanType: 'delegation',
          name: 'OK Delegation',
          startTs: now + i * 100,
          endTs: now + i * 100 + 50,
          status: 'ok',
          metadata: { targetAgentId: 'agent_b' },
        });
      }

      writer.startSpan({
        traceId: 'trace_error_1',
        sessionId: 'sess_1',
        agentId: 'agent_a',
        spanType: 'delegation',
        name: 'Error Delegation',
        startTs: now + 1000,
        endTs: now + 1050,
        status: 'error',
        metadata: { targetAgentId: 'agent_b' },
      });
    });

    it('should classify edge as "mixed" with 10% error rate', () => {
      const topology = buildTopologyGraph(db, {});

      const edge = topology.edges.find((e) => e.source === 'agent_a' && e.target === 'agent_b');
      expect(edge).toBeDefined();
      expect(edge?.count).toBe(10);
      expect(edge?.status).toBe('mixed'); // 10% error rate → mixed
    });
  });
});
