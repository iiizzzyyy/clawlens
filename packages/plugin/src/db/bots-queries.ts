/**
 * Bot overview query functions
 *
 * Per-agent aggregate stats and sparkline data for the Bots dashboard.
 */

import type Database from 'better-sqlite3';

export interface AgentStats {
  agentId: string;
  sessionCount: number;
  messageCount: number;
  totalTokens: number;
  tokensIn: number;
  tokensOut: number;
  totalCost: number;
  errorCount: number;
  toolCalls: number;
  llmCalls: number;
  lastActiveTs: number | null;
  avgResponseMs: number | null;
}

export interface DelegationEntry {
  agentId: string;
  count: number;
  failureCount: number;
}

export interface AgentDelegations {
  delegatesTo: DelegationEntry[];
  delegatedFrom: DelegationEntry[];
}

export interface BotFilters {
  fromTs?: number;
  toTs?: number;
}

export interface DailyAgentData {
  day: string;
  tokens: number;
  avgResponseMs: number | null;
}

/**
 * Get aggregate stats per agent
 */
export function getAgentStats(
  db: Database.Database,
  agentIds: string[],
  filters?: BotFilters
): Map<string, AgentStats> {
  if (agentIds.length === 0) return new Map();

  const placeholders = agentIds.map(() => '?').join(', ');
  const timeConditions: string[] = [];
  const timeParams: unknown[] = [];
  if (filters?.fromTs) {
    timeConditions.push('AND start_ts >= ?');
    timeParams.push(filters.fromTs);
  }
  if (filters?.toTs) {
    timeConditions.push('AND start_ts <= ?');
    timeParams.push(filters.toTs);
  }

  const sql = `
    SELECT
      agent_id,
      COUNT(DISTINCT CASE WHEN span_type = 'session' THEN id END) as session_count,
      COUNT(CASE WHEN span_type = 'turn' THEN 1 END) as message_count,
      COALESCE(SUM(tokens_in), 0) + COALESCE(SUM(tokens_out), 0) as total_tokens,
      COALESCE(SUM(tokens_in), 0) as tokens_in,
      COALESCE(SUM(tokens_out), 0) as tokens_out,
      COALESCE(SUM(cost_usd), 0) as total_cost,
      SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error_count,
      COUNT(CASE WHEN span_type = 'tool_exec' THEN 1 END) as tool_calls,
      COUNT(CASE WHEN span_type = 'llm_call' THEN 1 END) as llm_calls,
      MAX(start_ts) as last_active_ts,
      AVG(CASE WHEN span_type = 'turn' AND duration_ms IS NOT NULL THEN duration_ms END) as avg_response_ms
    FROM spans
    WHERE agent_id IN (${placeholders})
      ${timeConditions.join('\n      ')}
    GROUP BY agent_id
  `;

  const rows = db.prepare(sql).all(...agentIds, ...timeParams) as Array<{
    agent_id: string;
    session_count: number;
    message_count: number;
    total_tokens: number;
    tokens_in: number;
    tokens_out: number;
    total_cost: number;
    error_count: number;
    tool_calls: number;
    llm_calls: number;
    last_active_ts: number | null;
    avg_response_ms: number | null;
  }>;

  const result = new Map<string, AgentStats>();
  for (const row of rows) {
    result.set(row.agent_id, {
      agentId: row.agent_id,
      sessionCount: row.session_count,
      messageCount: row.message_count,
      totalTokens: row.total_tokens,
      tokensIn: row.tokens_in,
      tokensOut: row.tokens_out,
      totalCost: row.total_cost,
      errorCount: row.error_count,
      toolCalls: row.tool_calls,
      llmCalls: row.llm_calls,
      lastActiveTs: row.last_active_ts,
      avgResponseMs: row.avg_response_ms ? Math.round(row.avg_response_ms) : null,
    });
  }
  return result;
}

/**
 * Get daily sparkline data per agent for the past N days
 */
export function getAgentSparklines(
  db: Database.Database,
  agentIds: string[],
  filters?: BotFilters
): Map<string, DailyAgentData[]> {
  if (agentIds.length === 0) return new Map();

  const now = Date.now();
  const fromTs = filters?.fromTs ?? now - 7 * 24 * 60 * 60 * 1000;
  const toTs = filters?.toTs ?? now;
  const placeholders = agentIds.map(() => '?').join(', ');

  const sql = `
    SELECT
      agent_id,
      date(start_ts / 1000, 'unixepoch') as day,
      COALESCE(SUM(tokens_in), 0) + COALESCE(SUM(tokens_out), 0) as daily_tokens,
      AVG(CASE WHEN span_type = 'turn' AND duration_ms IS NOT NULL THEN duration_ms END) as daily_avg_response_ms
    FROM spans
    WHERE agent_id IN (${placeholders})
      AND start_ts >= ?
      AND start_ts <= ?
    GROUP BY agent_id, date(start_ts / 1000, 'unixepoch')
    ORDER BY agent_id, day
  `;

  const rows = db.prepare(sql).all(...agentIds, fromTs, toTs) as Array<{
    agent_id: string;
    day: string;
    daily_tokens: number;
    daily_avg_response_ms: number | null;
  }>;

  // Build day list for gap filling
  const days = Math.max(1, Math.ceil((toTs - fromTs) / (24 * 60 * 60 * 1000)));
  const dayList: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(toTs - i * 24 * 60 * 60 * 1000);
    dayList.push(d.toISOString().slice(0, 10));
  }

  // Group by agent
  const byAgent = new Map<string, Map<string, DailyAgentData>>();
  for (const row of rows) {
    if (!byAgent.has(row.agent_id)) {
      byAgent.set(row.agent_id, new Map());
    }
    byAgent.get(row.agent_id)!.set(row.day, {
      day: row.day,
      tokens: row.daily_tokens,
      avgResponseMs: row.daily_avg_response_ms ? Math.round(row.daily_avg_response_ms) : null,
    });
  }

  // Fill gaps and build result
  const result = new Map<string, DailyAgentData[]>();
  for (const agentId of agentIds) {
    const agentData = byAgent.get(agentId);
    const filled = dayList.map((day) => {
      const existing = agentData?.get(day);
      return existing ?? { day, tokens: 0, avgResponseMs: null };
    });
    result.set(agentId, filled);
  }

  return result;
}

/**
 * Get delegation relationships per agent
 */
export function getAgentDelegations(
  db: Database.Database,
  agentIds: string[],
  filters?: BotFilters
): Map<string, AgentDelegations> {
  if (agentIds.length === 0) return new Map();

  const placeholders = agentIds.map(() => '?').join(', ');
  const timeConditions: string[] = [];
  const timeParams: unknown[] = [];
  if (filters?.fromTs) {
    timeConditions.push('AND start_ts >= ?');
    timeParams.push(filters.fromTs);
  }
  if (filters?.toTs) {
    timeConditions.push('AND start_ts <= ?');
    timeParams.push(filters.toTs);
  }

  const sql = `
    SELECT
      agent_id as source,
      json_extract(metadata, '$.targetAgentId') as target,
      COUNT(*) as count,
      SUM(CASE WHEN status IN ('error', 'timeout') THEN 1 ELSE 0 END) as failures
    FROM spans
    WHERE span_type = 'delegation'
      AND agent_id IN (${placeholders})
      AND json_extract(metadata, '$.targetAgentId') IS NOT NULL
      ${timeConditions.join('\n      ')}
    GROUP BY agent_id, json_extract(metadata, '$.targetAgentId')
    ORDER BY count DESC
  `;

  const rows = db.prepare(sql).all(...agentIds, ...timeParams) as Array<{
    source: string;
    target: string;
    count: number;
    failures: number;
  }>;

  // Initialize result map
  const delegations = new Map<string, AgentDelegations>();
  for (const id of agentIds) {
    delegations.set(id, { delegatesTo: [], delegatedFrom: [] });
  }

  for (const row of rows) {
    // Outgoing for source agent
    const sourceEntry = delegations.get(row.source);
    if (sourceEntry) {
      sourceEntry.delegatesTo.push({
        agentId: row.target,
        count: row.count,
        failureCount: row.failures,
      });
    }

    // Incoming for target agent (if in our list)
    const targetEntry = delegations.get(row.target);
    if (targetEntry) {
      targetEntry.delegatedFrom.push({
        agentId: row.source,
        count: row.count,
        failureCount: row.failures,
      });
    }
  }

  return delegations;
}
