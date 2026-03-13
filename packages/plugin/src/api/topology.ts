/**
 * Topology API handlers
 *
 * Handles agent topology graph endpoint.
 */

import type { SpanReader } from '../db/reader.js';
import type { TopologyGraph } from '../db/types.js';
import type { ApiResponse } from './sessions.js';
import { parseQueryParams } from './sessions.js';

/**
 * Topology query filters
 */
interface TopologyFilters {
  fromTs?: number;
  toTs?: number;
  agentId?: string;
}

/**
 * Parse topology filters from query string
 */
function parseTopologyFilters(url: string): TopologyFilters {
  const params = parseQueryParams(url);
  const result: TopologyFilters = {};

  if (params.fromTs) {
    const ts = parseInt(params.fromTs, 10);
    if (!isNaN(ts)) result.fromTs = ts;
  }

  if (params.toTs) {
    const ts = parseInt(params.toTs, 10);
    if (!isNaN(ts)) result.toTs = ts;
  }

  if (params.agentId) {
    result.agentId = params.agentId;
  }

  return result;
}

/**
 * Handle GET /clawlens/api/topology
 *
 * Returns agent topology graph with nodes (agents) and edges (delegations).
 *
 * Query params:
 * - fromTs: Start timestamp (Unix ms)
 * - toTs: End timestamp (Unix ms)
 * - agentId: Filter by agent (shows only subgraph containing this agent)
 */
export function handleTopology(
  url: string,
  reader: SpanReader
): ApiResponse<TopologyGraph> {
  const filters = parseTopologyFilters(url);

  try {
    const topology = reader.getTopology(filters.fromTs, filters.toTs);

    return {
      data: topology,
      meta: {
        total: topology.nodes.length,
      },
    };
  } catch (error) {
    return {
      data: { nodes: [], edges: [], metadata: {} },
      error: {
        code: 'QUERY_ERROR',
        message: error instanceof Error ? error.message : 'Topology query failed',
      },
    };
  }
}
