/**
 * Topology graph builder
 *
 * Builds agent delegation graphs or channel-flow diagrams for visualization.
 */

import type Database from 'better-sqlite3';
import type { TopologyGraph, TopologyNode, TopologyEdge } from './types.js';

export interface TopologyFilters {
  fromTs?: number;
  toTs?: number;
  agentId?: string;
}

/**
 * Build topology graph from delegation spans
 *
 * For multi-agent setups: returns agent delegation graph
 * For single-agent setups: returns channel-flow graph (agent → channels)
 */
export function buildTopologyGraph(
  db: Database.Database,
  filters: TopologyFilters = {}
): TopologyGraph {
  // First, check if we have multiple agents
  const agentCountQuery = `
    SELECT COUNT(DISTINCT agent_id) as agent_count
    FROM spans
    WHERE span_type = 'session'
      ${filters.fromTs ? 'AND start_ts >= @fromTs' : ''}
      ${filters.toTs ? 'AND start_ts <= @toTs' : ''}
  `;

  const agentCountRow = db.prepare(agentCountQuery).get({
    fromTs: filters.fromTs,
    toTs: filters.toTs,
  }) as { agent_count: number };

  const isMultiAgent = agentCountRow.agent_count > 1;

  if (isMultiAgent) {
    return buildAgentDelegationGraph(db, filters);
  } else {
    return buildChannelFlowGraph(db, filters);
  }
}

/**
 * Build agent delegation graph (multi-agent scenario)
 */
function buildAgentDelegationGraph(
  db: Database.Database,
  filters: TopologyFilters
): TopologyGraph {
  const params: Record<string, unknown> = {};
  const conditions: string[] = [];

  if (filters.fromTs) {
    conditions.push('start_ts >= @fromTs');
    params.fromTs = filters.fromTs;
  }

  if (filters.toTs) {
    conditions.push('start_ts <= @toTs');
    params.toTs = filters.toTs;
  }

  if (filters.agentId) {
    conditions.push('agent_id = @agentId');
    params.agentId = filters.agentId;
  }

  const whereClause = conditions.length > 0 ? 'AND ' + conditions.join(' AND ') : '';

  // Build nodes (agents)
  const nodeQuery = `
    SELECT
      agent_id as id,
      agent_id as label,
      COUNT(*) as span_count,
      SUM(cost_usd) as total_cost,
      SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error_count
    FROM spans
    WHERE span_type = 'session' ${whereClause}
    GROUP BY agent_id
    ORDER BY total_cost DESC
  `;

  const nodeRows = db.prepare(nodeQuery).all(params) as Array<{
    id: string;
    label: string;
    span_count: number;
    total_cost: number;
    error_count: number;
  }>;

  const nodes: TopologyNode[] = nodeRows.map((row) => ({
    id: row.id,
    label: row.label,
    spanCount: row.span_count,
    totalCost: row.total_cost,
    errorCount: row.error_count,
  }));

  // Build edges (delegations)
  const edgeQuery = `
    SELECT
      agent_id as source,
      json_extract(metadata, '$.targetAgentId') as target,
      COUNT(*) as count,
      AVG(duration_ms) as avg_duration,
      SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errors,
      SUM(CASE WHEN status = 'timeout' THEN 1 ELSE 0 END) as timeouts,
      SUM(CASE WHEN status = 'ok' THEN 1 ELSE 0 END) as successes
    FROM spans
    WHERE span_type = 'delegation'
      AND json_extract(metadata, '$.targetAgentId') IS NOT NULL
      ${whereClause}
    GROUP BY agent_id, json_extract(metadata, '$.targetAgentId')
    ORDER BY count DESC
  `;

  const edgeRows = db.prepare(edgeQuery).all(params) as Array<{
    source: string;
    target: string;
    count: number;
    avg_duration: number | null;
    errors: number;
    timeouts: number;
    successes: number;
  }>;

  const edges: TopologyEdge[] = edgeRows.map((row) => {
    const total = row.count;
    const errorRate = total > 0 ? row.errors / total : 0;
    const timeoutRate = total > 0 ? row.timeouts / total : 0;

    // Determine edge status color
    let status: 'ok' | 'mixed' | 'error';
    if (errorRate > 0.5) {
      status = 'error'; // Mostly errors (red)
    } else if (timeoutRate >= 0.3 || errorRate >= 0.1) {
      status = 'mixed'; // Some errors or timeouts (yellow)
    } else {
      status = 'ok'; // Mostly successful (green)
    }

    return {
      source: row.source,
      target: row.target,
      count: row.count,
      status,
    };
  });

  return {
    nodes,
    edges,
    metadata: { fromTs: filters.fromTs, toTs: filters.toTs },
  };
}

/**
 * Build channel-flow graph (single-agent scenario)
 *
 * Creates a hub-and-spoke diagram with the agent at center
 * and channels as leaf nodes.
 */
function buildChannelFlowGraph(
  db: Database.Database,
  filters: TopologyFilters
): TopologyGraph {
  const params: Record<string, unknown> = {};
  const conditions: string[] = [];

  if (filters.fromTs) {
    conditions.push('start_ts >= @fromTs');
    params.fromTs = filters.fromTs;
  }

  if (filters.toTs) {
    conditions.push('start_ts <= @toTs');
    params.toTs = filters.toTs;
  }

  const whereClause = conditions.length > 0 ? 'AND ' + conditions.join(' AND ') : '';

  // Get the single agent
  const agentQuery = `
    SELECT
      agent_id as id,
      agent_id as label,
      COUNT(*) as span_count,
      SUM(cost_usd) as total_cost,
      SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error_count
    FROM spans
    WHERE span_type = 'session' ${whereClause}
    GROUP BY agent_id
    LIMIT 1
  `;

  const agentRow = db.prepare(agentQuery).get(params) as {
    id: string;
    label: string;
    span_count: number;
    total_cost: number;
    error_count: number;
  } | undefined;

  if (!agentRow) {
    return {
      nodes: [],
      edges: [],
      metadata: { fromTs: filters.fromTs, toTs: filters.toTs },
    };
  }

  const nodes: TopologyNode[] = [
    {
      id: agentRow.id,
      label: agentRow.label,
      spanCount: agentRow.span_count,
      totalCost: agentRow.total_cost,
      errorCount: agentRow.error_count,
    },
  ];

  // Get channels and create channel nodes
  const channelQuery = `
    SELECT
      COALESCE(channel, 'unknown') as channel,
      COUNT(*) as session_count,
      SUM(cost_usd) as total_cost,
      SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error_count
    FROM spans
    WHERE span_type = 'session' ${whereClause}
    GROUP BY channel
    ORDER BY session_count DESC
  `;

  const channelRows = db.prepare(channelQuery).all(params) as Array<{
    channel: string;
    session_count: number;
    total_cost: number;
    error_count: number;
  }>;

  const edges: TopologyEdge[] = [];

  for (const channelRow of channelRows) {
    const channelId = `channel_${channelRow.channel}`;

    // Add channel node
    nodes.push({
      id: channelId,
      label: channelRow.channel,
      spanCount: channelRow.session_count,
      totalCost: channelRow.total_cost,
      errorCount: channelRow.error_count,
    });

    // Add edge from channel to agent
    const errorRate = channelRow.session_count > 0 ? channelRow.error_count / channelRow.session_count : 0;
    const status: 'ok' | 'mixed' | 'error' = errorRate > 0.5 ? 'error' : errorRate > 0.1 ? 'mixed' : 'ok';

    edges.push({
      source: channelId,
      target: agentRow.id,
      count: channelRow.session_count,
      status,
    });
  }

  return {
    nodes,
    edges,
    metadata: { fromTs: filters.fromTs, toTs: filters.toTs },
  };
}
