/**
 * Daily stats aggregator
 *
 * Computes and stores daily aggregated statistics for fast dashboard queries.
 */

import type Database from 'better-sqlite3';

export interface DailyStatsInput {
  date: string; // YYYY-MM-DD
  agentId: string;
  channel: string | null;
  model: string | null;
  totalSpans: number;
  totalErrors: number;
  totalCost: number;
  totalTokens: number;
  avgDuration: number;
}

/**
 * Compute daily stats for a given date
 * Can be called on-demand or scheduled (e.g., via cron)
 */
export function computeDailyStats(db: Database.Database, date: string): number {
  // Compute stats for the given date
  const query = `
    SELECT
      date(start_ts / 1000, 'unixepoch') as date,
      agent_id,
      channel,
      model,
      COUNT(*) as total_spans,
      SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as total_errors,
      SUM(cost_usd) as total_cost,
      SUM(tokens_in + tokens_out) as total_tokens,
      AVG(duration_ms) as avg_duration
    FROM spans
    WHERE date(start_ts / 1000, 'unixepoch') = ?
    GROUP BY date(start_ts / 1000, 'unixepoch'), agent_id, channel, model
  `;

  const rows = db.prepare(query).all(date) as Array<{
    date: string;
    agent_id: string;
    channel: string | null;
    model: string | null;
    total_spans: number;
    total_errors: number;
    total_cost: number;
    total_tokens: number;
    avg_duration: number;
  }>;

  // Upsert into daily_stats table
  const upsert = db.prepare(`
    INSERT INTO daily_stats (
      date,
      agent_id,
      channel,
      model,
      total_spans,
      total_errors,
      total_cost,
      total_tokens,
      avg_duration
    ) VALUES (
      @date,
      @agentId,
      @channel,
      @model,
      @totalSpans,
      @totalErrors,
      @totalCost,
      @totalTokens,
      @avgDuration
    )
    ON CONFLICT(date, agent_id, channel, model) DO UPDATE SET
      total_spans = excluded.total_spans,
      total_errors = excluded.total_errors,
      total_cost = excluded.total_cost,
      total_tokens = excluded.total_tokens,
      avg_duration = excluded.avg_duration
  `);

  const insertMany = db.transaction((stats: DailyStatsInput[]) => {
    for (const stat of stats) {
      upsert.run({
        date: stat.date,
        agentId: stat.agentId,
        channel: stat.channel,
        model: stat.model,
        totalSpans: stat.totalSpans,
        totalErrors: stat.totalErrors,
        totalCost: stat.totalCost,
        totalTokens: stat.totalTokens,
        avgDuration: stat.avgDuration,
      });
    }
  });

  const stats: DailyStatsInput[] = rows.map((row) => ({
    date: row.date,
    agentId: row.agent_id,
    channel: row.channel,
    model: row.model,
    totalSpans: row.total_spans,
    totalErrors: row.total_errors,
    totalCost: row.total_cost,
    totalTokens: row.total_tokens,
    avgDuration: row.avg_duration,
  }));

  insertMany(stats);

  return stats.length;
}

/**
 * Compute daily stats for a date range
 */
export function computeDailyStatsRange(
  db: Database.Database,
  fromDate: string,
  toDate: string
): number {
  // Generate date range
  const dates: string[] = [];
  const start = new Date(fromDate);
  const end = new Date(toDate);

  for (let d = start; d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().split('T')[0]);
  }

  let totalRows = 0;
  for (const date of dates) {
    totalRows += computeDailyStats(db, date);
  }

  return totalRows;
}

/**
 * Auto-compute stats for yesterday (for cron jobs)
 */
export function computeYesterdayStats(db: Database.Database): number {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const date = yesterday.toISOString().split('T')[0];

  return computeDailyStats(db, date);
}
