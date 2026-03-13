/**
 * Session API handlers
 *
 * Handles session list, replay, and summary endpoints.
 */

import type { SpanReader } from '../db/reader.js';
import type { SessionListFilters } from '../db/types.js';

/**
 * API response envelope
 */
export interface ApiResponse<T> {
  data: T;
  meta?: {
    total?: number;
    offset?: number;
    limit?: number;
  };
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Parse query string parameters from URL
 */
export function parseQueryParams(url: string): Record<string, string> {
  const params: Record<string, string> = {};
  const queryIndex = url.indexOf('?');
  if (queryIndex === -1) return params;

  const queryString = url.slice(queryIndex + 1);
  for (const pair of queryString.split('&')) {
    const [key, value] = pair.split('=');
    if (key) {
      params[decodeURIComponent(key)] = value ? decodeURIComponent(value) : '';
    }
  }
  return params;
}

/**
 * Extract session ID from URL path
 * Expects: /clawlens/api/sessions/:id/...
 */
export function extractSessionId(url: string): string | null {
  const match = url.match(/\/clawlens\/api\/sessions\/([^/?]+)/);
  return match ? match[1] : null;
}

/**
 * Handle GET /clawlens/api/sessions
 *
 * Query params:
 * - agentId: Filter by agent
 * - channel: Filter by channel
 * - status: Filter by status (ok|error)
 * - fromTs: Start timestamp (Unix ms)
 * - toTs: End timestamp (Unix ms)
 * - limit: Max results (default 100)
 * - offset: Pagination offset (default 0)
 */
export function handleSessionsList(
  url: string,
  reader: SpanReader
): ApiResponse<ReturnType<SpanReader['getSessionList']>> {
  const params = parseQueryParams(url);

  const filters: SessionListFilters = {};

  if (params.agentId) {
    filters.agentId = params.agentId;
  }
  if (params.channel) {
    filters.channel = params.channel;
  }
  if (params.status) {
    if (params.status !== 'ok' && params.status !== 'error') {
      return {
        data: [],
        error: {
          code: 'INVALID_PARAM',
          message: 'status must be "ok" or "error"',
        },
      };
    }
    filters.status = params.status;
  }
  if (params.fromTs) {
    const ts = parseInt(params.fromTs, 10);
    if (isNaN(ts)) {
      return {
        data: [],
        error: {
          code: 'INVALID_PARAM',
          message: 'fromTs must be a valid Unix timestamp',
        },
      };
    }
    filters.fromTs = ts;
  }
  if (params.toTs) {
    const ts = parseInt(params.toTs, 10);
    if (isNaN(ts)) {
      return {
        data: [],
        error: {
          code: 'INVALID_PARAM',
          message: 'toTs must be a valid Unix timestamp',
        },
      };
    }
    filters.toTs = ts;
  }
  if (params.limit) {
    const limit = parseInt(params.limit, 10);
    if (isNaN(limit) || limit <= 0) {
      return {
        data: [],
        error: {
          code: 'INVALID_PARAM',
          message: 'limit must be a positive integer',
        },
      };
    }
    filters.limit = Math.min(limit, 1000); // Cap at 1000
  }
  if (params.offset) {
    const offset = parseInt(params.offset, 10);
    if (isNaN(offset) || offset < 0) {
      return {
        data: [],
        error: {
          code: 'INVALID_PARAM',
          message: 'offset must be a non-negative integer',
        },
      };
    }
    filters.offset = offset;
  }

  const sessions = reader.getSessionList(filters);

  return {
    data: sessions,
    meta: {
      limit: filters.limit ?? 100,
      offset: filters.offset ?? 0,
    },
  };
}

/**
 * Handle GET /clawlens/api/sessions/:id/replay
 *
 * Returns full session replay data with hierarchical span tree.
 */
export function handleSessionReplay(
  url: string,
  reader: SpanReader
): ApiResponse<ReturnType<SpanReader['getSpanTree']>> {
  const sessionId = extractSessionId(url);

  if (!sessionId) {
    return {
      data: null,
      error: {
        code: 'MISSING_PARAM',
        message: 'Session ID is required',
      },
    };
  }

  const tree = reader.getSpanTree(sessionId);

  if (!tree) {
    return {
      data: null,
      error: {
        code: 'NOT_FOUND',
        message: `Session ${sessionId} not found`,
      },
    };
  }

  return {
    data: tree,
  };
}

/**
 * Handle GET /clawlens/api/sessions/:id/summary
 *
 * Returns summary statistics for a session.
 */
export function handleSessionSummary(
  url: string,
  reader: SpanReader
): ApiResponse<ReturnType<SpanReader['getSessionList']>[0] | null> {
  const sessionId = extractSessionId(url);

  if (!sessionId) {
    return {
      data: null,
      error: {
        code: 'MISSING_PARAM',
        message: 'Session ID is required',
      },
    };
  }

  // Get session from list (returns summary stats)
  const sessions = reader.getSessionList({ limit: 1 });
  const session = sessions.find((s) => s.sessionId === sessionId);

  if (!session) {
    return {
      data: null,
      error: {
        code: 'NOT_FOUND',
        message: `Session ${sessionId} not found`,
      },
    };
  }

  return {
    data: session,
  };
}
