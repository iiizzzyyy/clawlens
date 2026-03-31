/**
 * Pre-built analytics query functions
 *
 * Each function returns typed results shaped for direct chart rendering.
 * All queries are efficient single SQL queries (no N+1).
 */

import type Database from 'better-sqlite3';
import type { AnalyticsParams } from './types.js';

/**
 * Analytics query result types
 */
export interface CostByAgentModelResult {
  agentId: string;
  model: string;
  totalCost: number;
  sessionCount: number;
  avgCostPerSession: number;
}

export interface CostPerSuccessfulTaskResult {
  agentId: string;
  successfulTurns: number;
  totalCost: number;
  costPerTask: number;
}

export interface ToolFailureRateResult {
  toolName: string;
  totalCalls: number;
  failedCalls: number;
  failureRate: number;
}

export interface RetryClusteringResult {
  agentId: string;
  toolName: string;
  retryCount: number;
  avgTimeBetweenRetries: number;
}

export interface LatencyPercentilesResult {
  spanType: string;
  p50: number;
  p90: number;
  p99: number;
  count: number;
}

export interface SessionDurationDistributionResult {
  bucket: string; // e.g., "0-30s", "30-60s"
  count: number;
  avgCost: number;
}

export interface ErrorHotspotsByChannelResult {
  channel: string;
  errorCount: number;
  totalSessions: number;
  errorRate: number;
}

export interface TokenWasteResult {
  agentId: string;
  rereadTokens: number;
  estimatedCost: number;
  wastePercentage: number;
}

/**
 * Helper to build time range conditions
 */
function buildTimeConditions(params: AnalyticsParams, tableAlias?: string): {
  where: string;
  params: Record<string, unknown>;
} {
  const conditions: string[] = [];
  const queryParams: Record<string, unknown> = {};
  const prefix = tableAlias ? `${tableAlias}.` : '';

  if (params.fromTs) {
    conditions.push(`${prefix}start_ts >= @fromTs`);
    queryParams.fromTs = params.fromTs;
  }

  if (params.toTs) {
    conditions.push(`${prefix}start_ts <= @toTs`);
    queryParams.toTs = params.toTs;
  }

  if (params.agentId) {
    conditions.push(`${prefix}agent_id = @agentId`);
    queryParams.agentId = params.agentId;
  }

  if (params.channel) {
    conditions.push(`${prefix}channel = @channel`);
    queryParams.channel = params.channel;
  }

  if (params.model) {
    conditions.push(`${prefix}model = @model`);
    queryParams.model = params.model;
  }

  return {
    where: conditions.length > 0 ? conditions.join(' AND ') : '',
    params: queryParams,
  };
}

/**
 * Query 1: Cost by agent + model
 * "Which agent/model combo is burning money?"
 */
export function costByAgentModel(
  db: Database.Database,
  params: AnalyticsParams = {}
): CostByAgentModelResult[] {
  const conditions = buildTimeConditions(params);

  const query = `
    SELECT
      agent_id,
      COALESCE(model, 'unknown') as model,
      SUM(cost_usd) as total_cost,
      COUNT(DISTINCT session_id) as session_count,
      SUM(cost_usd) / MAX(COUNT(DISTINCT session_id), 1) as avg_cost_per_session
    FROM spans
    WHERE span_type = 'llm_call'
      ${conditions.where ? 'AND ' + conditions.where : ''}
    GROUP BY agent_id, model
    ORDER BY total_cost DESC
    LIMIT 50
  `;

  const rows = db.prepare(query).all(conditions.params) as Array<{
    agent_id: string;
    model: string;
    total_cost: number;
    session_count: number;
    avg_cost_per_session: number;
  }>;

  return rows.map((row) => ({
    agentId: row.agent_id,
    model: row.model,
    totalCost: row.total_cost,
    sessionCount: row.session_count,
    avgCostPerSession: row.avg_cost_per_session || 0,
  }));
}

/**
 * Query 2: Cost per successful task
 * "Am I paying more for worse results?"
 * Success = turns without errors
 */
export function costPerSuccessfulTask(
  db: Database.Database,
  params: AnalyticsParams = {}
): CostPerSuccessfulTaskResult[] {
  const conditions = buildTimeConditions(params);

  const query = `
    WITH turn_stats AS (
      SELECT agent_id,
             COUNT(CASE WHEN status != 'error' THEN 1 END) as successful_turns
      FROM spans
      WHERE span_type = 'turn'
        ${conditions.where ? 'AND ' + conditions.where : ''}
      GROUP BY agent_id
    ),
    cost_stats AS (
      SELECT agent_id, SUM(cost_usd) as total_cost
      FROM spans
      WHERE span_type = 'llm_call'
        ${conditions.where ? 'AND ' + conditions.where : ''}
      GROUP BY agent_id
    )
    SELECT
      t.agent_id,
      t.successful_turns,
      COALESCE(c.total_cost, 0) as total_cost,
      CASE
        WHEN t.successful_turns > 0
        THEN COALESCE(c.total_cost, 0) / t.successful_turns
        ELSE 0
      END as cost_per_task
    FROM turn_stats t
    LEFT JOIN cost_stats c ON c.agent_id = t.agent_id
    ORDER BY cost_per_task DESC
    LIMIT 50
  `;

  const rows = db.prepare(query).all(conditions.params) as Array<{
    agent_id: string;
    successful_turns: number;
    total_cost: number;
    cost_per_task: number;
  }>;

  return rows.map((row) => ({
    agentId: row.agent_id,
    successfulTurns: row.successful_turns,
    totalCost: row.total_cost,
    costPerTask: row.cost_per_task,
  }));
}

/**
 * Query 3: Tool failure rate by tool
 * "Which tool is the most unreliable?"
 */
export function toolFailureRate(
  db: Database.Database,
  params: AnalyticsParams = {}
): ToolFailureRateResult[] {
  const conditions = buildTimeConditions(params);

  const query = `
    SELECT
      json_extract(metadata, '$.toolName') as tool_name,
      COUNT(*) as total_calls,
      SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as failed_calls,
      CAST(SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS REAL) / COUNT(*) as failure_rate
    FROM spans
    WHERE span_type = 'tool_exec'
      AND json_extract(metadata, '$.toolName') IS NOT NULL
      ${conditions.where ? 'AND ' + conditions.where : ''}
    GROUP BY json_extract(metadata, '$.toolName')
    HAVING COUNT(*) >= 1
    ORDER BY failure_rate DESC, total_calls DESC
    LIMIT 50
  `;

  const rows = db.prepare(query).all(conditions.params) as Array<{
    tool_name: string;
    total_calls: number;
    failed_calls: number;
    failure_rate: number;
  }>;

  return rows.map((row) => ({
    toolName: row.tool_name || 'unknown',
    totalCalls: row.total_calls,
    failedCalls: row.failed_calls,
    failureRate: row.failure_rate,
  }));
}

/**
 * Query 4: Retry clustering
 * "Where do retries concentrate? Same tool? Same agent?"
 * Detects repeated tool calls within the same turn
 */
export function retryClustering(
  db: Database.Database,
  params: AnalyticsParams = {}
): RetryClusteringResult[] {
  const conditions = buildTimeConditions(params);

  const query = `
    WITH tool_calls AS (
      SELECT
        agent_id,
        parent_id as turn_id,
        json_extract(metadata, '$.toolName') as tool_name,
        start_ts,
        LAG(start_ts) OVER (
          PARTITION BY parent_id, json_extract(metadata, '$.toolName')
          ORDER BY start_ts
        ) as prev_start
      FROM spans
      WHERE span_type = 'tool_exec'
        AND json_extract(metadata, '$.toolName') IS NOT NULL
        ${conditions.where ? 'AND ' + conditions.where : ''}
    )
    SELECT
      agent_id,
      tool_name,
      COUNT(*) as retry_count,
      AVG(start_ts - prev_start) as avg_time_between_retries
    FROM tool_calls
    WHERE prev_start IS NOT NULL
      AND start_ts - prev_start < 60000
    GROUP BY agent_id, tool_name
    HAVING COUNT(*) >= 1
    ORDER BY retry_count DESC
    LIMIT 50
  `;

  const rows = db.prepare(query).all(conditions.params) as Array<{
    agent_id: string;
    tool_name: string;
    retry_count: number;
    avg_time_between_retries: number;
  }>;

  return rows.map((row) => ({
    agentId: row.agent_id,
    toolName: row.tool_name || 'unknown',
    retryCount: row.retry_count,
    avgTimeBetweenRetries: row.avg_time_between_retries,
  }));
}

/**
 * Query 5: Latency percentiles by span type
 * "Is my bottleneck LLM inference or tool execution?"
 */
export function latencyPercentiles(
  db: Database.Database,
  params: AnalyticsParams = {}
): LatencyPercentilesResult[] {
  const conditions = buildTimeConditions(params);

  const query = `
    WITH duration_data AS (
      SELECT
        span_type,
        duration_ms,
        ROW_NUMBER() OVER (PARTITION BY span_type ORDER BY duration_ms) as row_num,
        COUNT(*) OVER (PARTITION BY span_type) as total_count
      FROM spans
      WHERE duration_ms IS NOT NULL
        AND duration_ms > 0
        ${conditions.where ? 'AND ' + conditions.where : ''}
    )
    SELECT
      span_type,
      MAX(CASE WHEN row_num = CAST(total_count * 0.50 AS INTEGER) THEN duration_ms END) as p50,
      MAX(CASE WHEN row_num = CAST(total_count * 0.90 AS INTEGER) THEN duration_ms END) as p90,
      MAX(CASE WHEN row_num = CAST(total_count * 0.99 AS INTEGER) THEN duration_ms END) as p99,
      MAX(total_count) as count
    FROM duration_data
    GROUP BY span_type
    HAVING count > 2
    ORDER BY p99 DESC
  `;

  const rows = db.prepare(query).all(conditions.params) as Array<{
    span_type: string;
    p50: number | null;
    p90: number | null;
    p99: number | null;
    count: number;
  }>;

  return rows.map((row) => ({
    spanType: row.span_type,
    p50: row.p50 || 0,
    p90: row.p90 || 0,
    p99: row.p99 || 0,
    count: row.count,
  }));
}

/**
 * Query 6: Session duration distribution
 * "Are conversations getting longer over time?"
 */
export function sessionDurationDistribution(
  db: Database.Database,
  params: AnalyticsParams = {}
): SessionDurationDistributionResult[] {
  const conditions = buildTimeConditions(params);

  const query = `
    WITH buckets AS (
      SELECT
        duration_ms,
        cost_usd,
        CASE
          WHEN duration_ms < 30000 THEN '0-30s'
          WHEN duration_ms < 60000 THEN '30-60s'
          WHEN duration_ms < 180000 THEN '1-3min'
          WHEN duration_ms < 600000 THEN '3-10min'
          WHEN duration_ms < 1800000 THEN '10-30min'
          ELSE '30min+'
        END as bucket
      FROM spans
      WHERE span_type = 'session'
        AND duration_ms IS NOT NULL
        ${conditions.where ? 'AND ' + conditions.where : ''}
    )
    SELECT
      bucket,
      COUNT(*) as count,
      AVG(cost_usd) as avg_cost
    FROM buckets
    GROUP BY bucket
    ORDER BY
      CASE bucket
        WHEN '0-30s' THEN 1
        WHEN '30-60s' THEN 2
        WHEN '1-3min' THEN 3
        WHEN '3-10min' THEN 4
        WHEN '10-30min' THEN 5
        ELSE 6
      END
  `;

  const rows = db.prepare(query).all(conditions.params) as Array<{
    bucket: string;
    count: number;
    avg_cost: number;
  }>;

  return rows.map((row) => ({
    bucket: row.bucket,
    count: row.count,
    avgCost: row.avg_cost || 0,
  }));
}

/**
 * Query 7: Error hotspots by channel
 * "Is Telegram more error-prone than Slack?"
 */
export function errorHotspotsByChannel(
  db: Database.Database,
  params: AnalyticsParams = {}
): ErrorHotspotsByChannelResult[] {
  const conditions = buildTimeConditions(params);

  const query = `
    SELECT
      COALESCE(channel, 'unknown') as channel,
      SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error_count,
      COUNT(*) as total_sessions,
      CAST(SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS REAL) / COUNT(*) as error_rate
    FROM spans
    WHERE span_type = 'session' ${conditions.where ? 'AND ' + conditions.where : ''}
    GROUP BY channel
    HAVING COUNT(*) >= 1
    ORDER BY error_rate DESC, total_sessions DESC
    LIMIT 50
  `;

  const rows = db.prepare(query).all(conditions.params) as Array<{
    channel: string;
    error_count: number;
    total_sessions: number;
    error_rate: number;
  }>;

  return rows.map((row) => ({
    channel: row.channel,
    errorCount: row.error_count,
    totalSessions: row.total_sessions,
    errorRate: row.error_rate,
  }));
}

/**
 * Query 8: Token waste (context re-reads)
 * "How much am I spending on re-reading history?"
 * Estimates waste by comparing tokens_in across LLM calls in the same session
 */
export function tokenWaste(
  db: Database.Database,
  params: AnalyticsParams = {}
): TokenWasteResult[] {
  const conditions = buildTimeConditions(params);

  const query = `
    WITH ordered_calls AS (
      SELECT
        agent_id,
        session_id,
        tokens_in,
        cost_usd,
        LAG(tokens_in) OVER (PARTITION BY session_id ORDER BY start_ts) as prev_tokens_in,
        ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY start_ts) as call_num
      FROM spans
      WHERE span_type = 'llm_call'
        ${conditions.where ? 'AND ' + conditions.where : ''}
    ),
    waste_calc AS (
      SELECT
        agent_id,
        session_id,
        SUM(CASE
          WHEN call_num > 1 AND prev_tokens_in IS NOT NULL AND tokens_in > prev_tokens_in
          THEN tokens_in - prev_tokens_in
          ELSE 0
        END) as reread_tokens,
        SUM(cost_usd) as total_cost
      FROM ordered_calls
      GROUP BY agent_id, session_id
    )
    SELECT
      agent_id,
      SUM(reread_tokens) as reread_tokens,
      SUM(reread_tokens) * 0.000003 as estimated_cost,
      CASE
        WHEN SUM(total_cost) > 0
        THEN (SUM(reread_tokens) * 0.000003) / SUM(total_cost) * 100
        ELSE 0
      END as waste_percentage
    FROM waste_calc
    GROUP BY agent_id
    HAVING reread_tokens > 0
    ORDER BY reread_tokens DESC
    LIMIT 50
  `;

  const rows = db.prepare(query).all(conditions.params) as Array<{
    agent_id: string;
    reread_tokens: number;
    estimated_cost: number;
    waste_percentage: number;
  }>;

  return rows.map((row) => ({
    agentId: row.agent_id,
    rereadTokens: row.reread_tokens,
    estimatedCost: row.estimated_cost,
    wastePercentage: row.waste_percentage,
  }));
}
