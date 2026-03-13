/**
 * Span reader for SQLite database queries
 *
 * Provides high-level query methods for session replay, analytics, and topology.
 */

import type Database from 'better-sqlite3';
import type {
  Span,
  SpanRow,
  SessionSummary,
  SessionListFilters,
  AnalyticsParams,
  AnalyticsResult,
  AnalyticsDataPoint,
  TopologyGraph,
  DailyStats,
  DailyStatsRow,
} from './types.js';
import { rowToSpan, rowToDailyStats } from './types.js';
import * as analyticsQueries from './analytics-queries.js';
import { buildTopologyGraph } from './topology.js';

/**
 * SpanReader class for database read operations
 */
export class SpanReader {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Get a single span by ID
   */
  getSpan(id: string): Span | null {
    const row = this.db.prepare('SELECT * FROM spans WHERE id = ?').get(id) as SpanRow | undefined;
    return row ? rowToSpan(row) : null;
  }

  /**
   * Get list of sessions with optional filtering
   *
   * Returns session-level spans with aggregated statistics
   */
  getSessionList(filters: SessionListFilters = {}): SessionSummary[] {
    const conditions: string[] = ["span_type = 'session'"];
    const params: Record<string, unknown> = {};

    if (filters.agentId) {
      conditions.push('agent_id = @agentId');
      params.agentId = filters.agentId;
    }

    if (filters.channel) {
      conditions.push('channel = @channel');
      params.channel = filters.channel;
    }

    if (filters.status) {
      conditions.push('status = @status');
      params.status = filters.status;
    }

    if (filters.fromTs) {
      conditions.push('start_ts >= @fromTs');
      params.fromTs = filters.fromTs;
    }

    if (filters.toTs) {
      conditions.push('start_ts <= @toTs');
      params.toTs = filters.toTs;
    }

    const limit = filters.limit ?? 100;
    const offset = filters.offset ?? 0;

    const query = `
      SELECT
        s.session_id,
        s.agent_id,
        s.channel,
        s.start_ts,
        s.end_ts,
        s.duration_ms,
        s.status,
        COALESCE(agg.total_cost, 0) as total_cost,
        COALESCE(agg.tokens_in, 0) as tokens_in,
        COALESCE(agg.tokens_out, 0) as tokens_out,
        COALESCE(agg.span_count, 0) as span_count,
        COALESCE(agg.error_count, 0) as error_count
      FROM spans s
      LEFT JOIN (
        SELECT
          session_id,
          SUM(cost_usd) as total_cost,
          SUM(tokens_in) as tokens_in,
          SUM(tokens_out) as tokens_out,
          COUNT(*) as span_count,
          SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error_count
        FROM spans
        GROUP BY session_id
      ) agg ON s.session_id = agg.session_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY s.start_ts DESC
      LIMIT @limit OFFSET @offset
    `;

    params.limit = limit;
    params.offset = offset;

    const rows = this.db.prepare(query).all(params) as Array<{
      session_id: string;
      agent_id: string;
      channel: string | null;
      start_ts: number;
      end_ts: number | null;
      duration_ms: number | null;
      status: string;
      total_cost: number;
      tokens_in: number;
      tokens_out: number;
      span_count: number;
      error_count: number;
    }>;

    return rows.map((row) => ({
      sessionId: row.session_id,
      agentId: row.agent_id,
      channel: row.channel,
      startTs: row.start_ts,
      endTs: row.end_ts,
      durationMs: row.duration_ms,
      totalCost: row.total_cost,
      totalTokensIn: row.tokens_in,
      totalTokensOut: row.tokens_out,
      spanCount: row.span_count,
      errorCount: row.error_count,
      status: row.status as 'ok' | 'error' | 'timeout' | 'cancelled',
    }));
  }

  /**
   * Get all spans for a session replay
   *
   * Returns spans ordered by start timestamp for timeline display
   */
  getSessionReplay(sessionId: string): Span[] {
    const rows = this.db
      .prepare(
        `
      SELECT * FROM spans
      WHERE session_id = ?
      ORDER BY start_ts ASC, sequence_num ASC NULLS LAST
    `
      )
      .all(sessionId) as SpanRow[];

    return rows.map(rowToSpan);
  }

  /**
   * Get child spans of a parent span
   */
  getSpanChildren(spanId: string): Span[] {
    const rows = this.db
      .prepare(
        `
      SELECT * FROM spans
      WHERE parent_id = ?
      ORDER BY start_ts ASC, sequence_num ASC NULLS LAST
    `
      )
      .all(spanId) as SpanRow[];

    return rows.map(rowToSpan);
  }

  /**
   * Get span tree for a session (hierarchical structure)
   */
  getSpanTree(sessionId: string): Span & { children: Span[] } | null {
    const spans = this.getSessionReplay(sessionId);
    if (spans.length === 0) return null;

    // Build lookup map
    const spanMap = new Map<string, Span & { children: Span[] }>();
    for (const span of spans) {
      spanMap.set(span.id, { ...span, children: [] });
    }

    // Find root and build tree
    let root: (Span & { children: Span[] }) | null = null;

    for (const span of spans) {
      const enrichedSpan = spanMap.get(span.id)!;
      if (span.parentId && spanMap.has(span.parentId)) {
        spanMap.get(span.parentId)!.children.push(enrichedSpan);
      } else if (span.spanType === 'session') {
        root = enrichedSpan;
      }
    }

    return root;
  }

  /**
   * Run analytics query
   */
  getAnalytics(queryType: string, params: AnalyticsParams = {}): AnalyticsResult {
    switch (queryType) {
      // Legacy queries
      case 'cost_by_agent':
        return this.analyticsCostByAgent(params);
      case 'cost_by_model':
        return this.analyticsCostByModel(params);
      case 'errors_by_tool':
        return this.analyticsErrorsByTool(params);
      case 'latency_by_type':
        return this.analyticsLatencyByType(params);
      case 'sessions_over_time':
        return this.analyticsSessionsOverTime(params);

      // New investigative queries
      case 'cost_by_agent_model':
        return {
          queryType: 'cost_by_agent_model',
          data: analyticsQueries.costByAgentModel(this.db, params),
          metadata: { fromTs: params.fromTs, toTs: params.toTs },
        };
      case 'cost_per_successful_task':
        return {
          queryType: 'cost_per_successful_task',
          data: analyticsQueries.costPerSuccessfulTask(this.db, params),
          metadata: { fromTs: params.fromTs, toTs: params.toTs },
        };
      case 'tool_failure_rate':
        return {
          queryType: 'tool_failure_rate',
          data: analyticsQueries.toolFailureRate(this.db, params),
          metadata: { fromTs: params.fromTs, toTs: params.toTs },
        };
      case 'retry_clustering':
        return {
          queryType: 'retry_clustering',
          data: analyticsQueries.retryClustering(this.db, params),
          metadata: { fromTs: params.fromTs, toTs: params.toTs },
        };
      case 'latency_percentiles':
        return {
          queryType: 'latency_percentiles',
          data: analyticsQueries.latencyPercentiles(this.db, params),
          metadata: { fromTs: params.fromTs, toTs: params.toTs },
        };
      case 'session_duration_distribution':
        return {
          queryType: 'session_duration_distribution',
          data: analyticsQueries.sessionDurationDistribution(this.db, params),
          metadata: { fromTs: params.fromTs, toTs: params.toTs },
        };
      case 'error_hotspots_by_channel':
        return {
          queryType: 'error_hotspots_by_channel',
          data: analyticsQueries.errorHotspotsByChannel(this.db, params),
          metadata: { fromTs: params.fromTs, toTs: params.toTs },
        };
      case 'token_waste':
        return {
          queryType: 'token_waste',
          data: analyticsQueries.tokenWaste(this.db, params),
          metadata: { fromTs: params.fromTs, toTs: params.toTs },
        };

      default:
        return {
          queryType,
          data: [],
          metadata: { totalRecords: 0 },
        };
    }
  }

  private analyticsCostByAgent(params: AnalyticsParams): AnalyticsResult {
    const conditions = this.buildTimeConditions(params);
    const query = `
      SELECT
        agent_id as label,
        SUM(cost_usd) as value,
        COUNT(*) as count
      FROM spans
      WHERE span_type = 'session' ${conditions.where}
      GROUP BY agent_id
      ORDER BY value DESC
      LIMIT @limit
    `;

    const rows = this.db.prepare(query).all({
      ...conditions.params,
      limit: params.limit ?? 50,
    }) as AnalyticsDataPoint[];

    return {
      queryType: 'cost_by_agent',
      data: rows,
      metadata: {
        fromTs: params.fromTs,
        toTs: params.toTs,
        totalRecords: rows.length,
      },
    };
  }

  private analyticsCostByModel(params: AnalyticsParams): AnalyticsResult {
    const conditions = this.buildTimeConditions(params);
    const query = `
      SELECT
        COALESCE(model, 'unknown') as label,
        SUM(cost_usd) as value,
        COUNT(*) as count
      FROM spans
      WHERE span_type = 'llm_call' ${conditions.where}
      GROUP BY model
      ORDER BY value DESC
      LIMIT @limit
    `;

    const rows = this.db.prepare(query).all({
      ...conditions.params,
      limit: params.limit ?? 50,
    }) as AnalyticsDataPoint[];

    return {
      queryType: 'cost_by_model',
      data: rows,
      metadata: {
        fromTs: params.fromTs,
        toTs: params.toTs,
        totalRecords: rows.length,
      },
    };
  }

  private analyticsErrorsByTool(params: AnalyticsParams): AnalyticsResult {
    const conditions = this.buildTimeConditions(params);
    const query = `
      SELECT
        json_extract(metadata, '$.toolName') as label,
        COUNT(*) as value,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as count
      FROM spans
      WHERE span_type = 'tool_exec' ${conditions.where}
      GROUP BY json_extract(metadata, '$.toolName')
      ORDER BY count DESC
      LIMIT @limit
    `;

    const rows = this.db.prepare(query).all({
      ...conditions.params,
      limit: params.limit ?? 50,
    }) as AnalyticsDataPoint[];

    return {
      queryType: 'errors_by_tool',
      data: rows,
      metadata: {
        fromTs: params.fromTs,
        toTs: params.toTs,
        totalRecords: rows.length,
      },
    };
  }

  private analyticsLatencyByType(params: AnalyticsParams): AnalyticsResult {
    const conditions = this.buildTimeConditions(params);
    const query = `
      SELECT
        span_type as label,
        AVG(duration_ms) as value,
        COUNT(*) as count
      FROM spans
      WHERE duration_ms IS NOT NULL ${conditions.where}
      GROUP BY span_type
      ORDER BY value DESC
    `;

    const rows = this.db.prepare(query).all(conditions.params) as AnalyticsDataPoint[];

    return {
      queryType: 'latency_by_type',
      data: rows,
      metadata: {
        fromTs: params.fromTs,
        toTs: params.toTs,
        totalRecords: rows.length,
      },
    };
  }

  private analyticsSessionsOverTime(params: AnalyticsParams): AnalyticsResult {
    const conditions = this.buildTimeConditions(params);
    const query = `
      SELECT
        date(start_ts / 1000, 'unixepoch') as label,
        COUNT(*) as value,
        SUM(cost_usd) as count
      FROM spans
      WHERE span_type = 'session' ${conditions.where}
      GROUP BY date(start_ts / 1000, 'unixepoch')
      ORDER BY label ASC
      LIMIT @limit
    `;

    const rows = this.db.prepare(query).all({
      ...conditions.params,
      limit: params.limit ?? 365,
    }) as AnalyticsDataPoint[];

    return {
      queryType: 'sessions_over_time',
      data: rows,
      metadata: {
        fromTs: params.fromTs,
        toTs: params.toTs,
        totalRecords: rows.length,
      },
    };
  }

  private buildTimeConditions(params: AnalyticsParams): {
    where: string;
    params: Record<string, unknown>;
  } {
    const conditions: string[] = [];
    const queryParams: Record<string, unknown> = {};

    if (params.fromTs) {
      conditions.push('AND start_ts >= @fromTs');
      queryParams.fromTs = params.fromTs;
    }

    if (params.toTs) {
      conditions.push('AND start_ts <= @toTs');
      queryParams.toTs = params.toTs;
    }

    if (params.agentId) {
      conditions.push('AND agent_id = @agentId');
      queryParams.agentId = params.agentId;
    }

    if (params.channel) {
      conditions.push('AND channel = @channel');
      queryParams.channel = params.channel;
    }

    if (params.model) {
      conditions.push('AND model = @model');
      queryParams.model = params.model;
    }

    return {
      where: conditions.join(' '),
      params: queryParams,
    };
  }

  /**
   * Get agent topology graph
   */
  getTopology(fromTs?: number, toTs?: number): TopologyGraph {
    return buildTopologyGraph(this.db, { fromTs, toTs });
  }

  /**
   * Get daily stats
   */
  getDailyStats(fromDate: string, toDate: string): DailyStats[] {
    const rows = this.db
      .prepare(
        `
      SELECT * FROM daily_stats
      WHERE date >= ? AND date <= ?
      ORDER BY date DESC
    `
      )
      .all(fromDate, toDate) as DailyStatsRow[];

    return rows.map(rowToDailyStats);
  }

  /**
   * Find span for JSONL enrichment
   */
  findSpanForEnrichment(
    sessionId: string,
    timestamp: number,
    spanType: 'turn' | 'llm_call',
    windowMs = 5000
  ): Span | null {
    const row = this.db
      .prepare(
        `
      SELECT * FROM spans
      WHERE session_id = ?
        AND span_type = ?
        AND source = 'hook'
        AND start_ts BETWEEN ? AND ?
        AND tokens_in = 0
      ORDER BY start_ts DESC
      LIMIT 1
    `
      )
      .get(sessionId, spanType, timestamp - windowMs, timestamp + windowMs) as SpanRow | undefined;

    return row ? rowToSpan(row) : null;
  }
}

/**
 * Create a new SpanReader instance
 */
export function createSpanReader(db: Database.Database): SpanReader {
  return new SpanReader(db);
}
