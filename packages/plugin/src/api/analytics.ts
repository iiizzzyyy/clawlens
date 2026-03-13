/**
 * Analytics API handlers
 *
 * Handles cross-session analytics queries.
 */

import type { SpanReader } from '../db/reader.js';
import type { AnalyticsResult, AnalyticsParams } from '../db/types.js';
import type { ApiResponse } from './sessions.js';
import { parseQueryParams } from './sessions.js';

/**
 * Valid analytics query types
 */
export const ANALYTICS_QUERY_TYPES = [
  // Legacy queries
  'cost_by_model',
  'cost_by_agent',
  'cost_by_channel',
  'errors_by_tool',
  'latency_by_type',
  'sessions_over_time',
  'token_usage',
  // New investigative queries
  'cost_by_agent_model',
  'cost_per_successful_task',
  'tool_failure_rate',
  'retry_clustering',
  'latency_percentiles',
  'session_duration_distribution',
  'error_hotspots_by_channel',
  'token_waste',
] as const;

export type AnalyticsQueryType = (typeof ANALYTICS_QUERY_TYPES)[number];

/**
 * Extract query type from URL path
 * Expects: /clawlens/api/analytics/:queryType
 */
export function extractQueryType(url: string): string | null {
  const match = url.match(/\/clawlens\/api\/analytics\/([^/?]+)/);
  return match ? match[1] : null;
}

/**
 * Parse analytics params from query string
 */
function parseAnalyticsParams(url: string): AnalyticsParams {
  const params = parseQueryParams(url);
  const result: AnalyticsParams = {};

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

  if (params.channel) {
    result.channel = params.channel;
  }

  if (params.model) {
    result.model = params.model;
  }

  if (params.limit) {
    const limit = parseInt(params.limit, 10);
    if (!isNaN(limit) && limit > 0) result.limit = Math.min(limit, 1000);
  }

  return result;
}

/**
 * Handle GET /clawlens/api/analytics/:queryType
 *
 * Query params:
 * - fromTs: Start timestamp (Unix ms)
 * - toTs: End timestamp (Unix ms)
 * - agentId: Filter by agent
 * - channel: Filter by channel
 * - model: Filter by model
 * - limit: Max results (default 100)
 */
export function handleAnalytics(
  url: string,
  reader: SpanReader
): ApiResponse<AnalyticsResult | null> {
  const queryType = extractQueryType(url);

  if (!queryType) {
    return {
      data: null,
      error: {
        code: 'MISSING_PARAM',
        message: 'Query type is required. Use /analytics/:queryType',
      },
    };
  }

  // Validate query type
  if (!ANALYTICS_QUERY_TYPES.includes(queryType as AnalyticsQueryType)) {
    return {
      data: null,
      error: {
        code: 'INVALID_PARAM',
        message: `Invalid query type "${queryType}". Valid types: ${ANALYTICS_QUERY_TYPES.join(', ')}`,
      },
    };
  }

  const params = parseAnalyticsParams(url);

  try {
    const results = reader.getAnalytics(queryType as AnalyticsQueryType, params);

    return {
      data: results,
      meta: {
        limit: params.limit ?? 100,
      },
    };
  } catch (error) {
    return {
      data: null,
      error: {
        code: 'QUERY_ERROR',
        message: error instanceof Error ? error.message : 'Analytics query failed',
      },
    };
  }
}

/**
 * List available analytics query types
 */
export function handleAnalyticsTypes(): ApiResponse<typeof ANALYTICS_QUERY_TYPES> {
  return {
    data: ANALYTICS_QUERY_TYPES,
  };
}
