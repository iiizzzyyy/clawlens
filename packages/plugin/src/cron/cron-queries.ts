/**
 * Cron SQL queries — stats, summaries, and run history from cron_runs table
 */

import type Database from 'better-sqlite3';
import type { CronJob } from './cron-reader.js';

// ── Response types ──

export interface CronSummary {
  activeCount: number;
  totalCount: number;
  failingCount: number;
  nextRunJobName: string | null;
  nextRunAtMs: number | null;
  estimatedDailyCostUsd: number | null;
}

export interface CronJobWithStats extends CronJob {
  avgDurationMs: number | null;
  lastRunCostUsd: number | null;
  recentRuns: RunDot[];
  totalRuns: number;
  errorCount: number;
}

export interface RunDot {
  ts: number;
  status: string;
}

export interface CronRunEntry {
  ts: number;
  runAtMs: number | null;
  status: string | null;
  error: string | null;
  durationMs: number | null;
  model: string | null;
  summary: string | null;
  sessionId: string | null;
  costUsd: number | null;
}

// ── Queries ──

export function getCronSummary(
  db: Database.Database,
  jobs: CronJob[]
): CronSummary {
  const activeCount = jobs.filter((j) => j.enabled).length;
  const failingCount = jobs.filter(
    (j) => j.enabled && (j.state.consecutiveErrors ?? 0) > 0
  ).length;

  // Find the next-up job
  let nextRunJobName: string | null = null;
  let nextRunAtMs: number | null = null;
  for (const job of jobs) {
    if (!job.enabled || !job.state.nextRunAtMs) continue;
    if (nextRunAtMs === null || job.state.nextRunAtMs < nextRunAtMs) {
      nextRunAtMs = job.state.nextRunAtMs;
      nextRunJobName = job.name;
    }
  }

  // Estimate daily cost: sum of cost_usd from spans for sessions run in last 7 days, divided by 7
  const costRow = db
    .prepare(
      `
    SELECT COALESCE(SUM(s.cost_usd), 0) as total_cost
    FROM cron_runs cr
    JOIN spans s ON s.session_id = cr.session_id
    WHERE cr.run_at_ms > ? AND cr.status = 'ok'
  `
    )
    .get(Date.now() - 7 * 86400_000) as { total_cost: number } | undefined;

  const estimatedDailyCostUsd = costRow ? costRow.total_cost / 7 : null;

  return {
    activeCount,
    totalCount: jobs.length,
    failingCount,
    nextRunJobName,
    nextRunAtMs,
    estimatedDailyCostUsd,
  };
}

export function getJobsWithStats(
  db: Database.Database,
  jobs: CronJob[]
): CronJobWithStats[] {
  // Batch query: per-job stats
  const statsStmt = db.prepare(`
    SELECT
      job_id,
      COUNT(*) as total_runs,
      SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error_count,
      AVG(duration_ms) as avg_duration_ms
    FROM cron_runs
    GROUP BY job_id
  `);
  const statsRows = statsStmt.all() as Array<{
    job_id: string;
    total_runs: number;
    error_count: number;
    avg_duration_ms: number | null;
  }>;
  const statsMap = new Map(statsRows.map((r) => [r.job_id, r]));

  // Recent runs (last 10 per job) for history dots
  const recentRunsStmt = db.prepare(`
    SELECT job_id, ts, status
    FROM cron_runs
    WHERE job_id = ?
    ORDER BY ts DESC
    LIMIT 10
  `);

  // Last run cost via spans join
  const costStmt = db.prepare(`
    SELECT s.cost_usd
    FROM cron_runs cr
    JOIN spans s ON s.session_id = cr.session_id
    WHERE cr.job_id = ?
    ORDER BY cr.ts DESC
    LIMIT 1
  `);

  return jobs.map((job) => {
    const stats = statsMap.get(job.id);
    const recentRuns = (
      recentRunsStmt.all(job.id) as Array<{ ts: number; status: string }>
    )
      .reverse()
      .map((r) => ({ ts: r.ts, status: r.status || 'ok' }));

    const costRow = costStmt.get(job.id) as
      | { cost_usd: number }
      | undefined;

    return {
      ...job,
      avgDurationMs: stats?.avg_duration_ms ?? null,
      lastRunCostUsd: costRow?.cost_usd ?? null,
      recentRuns,
      totalRuns: stats?.total_runs ?? 0,
      errorCount: stats?.error_count ?? 0,
    };
  });
}

export function getJobRuns(
  db: Database.Database,
  jobId: string,
  limit = 20,
  offset = 0
): CronRunEntry[] {
  const rows = db
    .prepare(
      `
    SELECT
      cr.ts, cr.run_at_ms, cr.status, cr.error, cr.duration_ms,
      cr.model, cr.summary, cr.session_id,
      s.cost_usd
    FROM cron_runs cr
    LEFT JOIN spans s ON s.session_id = cr.session_id AND s.parent_id IS NULL
    WHERE cr.job_id = ?
    ORDER BY cr.ts DESC
    LIMIT ? OFFSET ?
  `
    )
    .all(jobId, limit, offset) as Array<{
    ts: number;
    run_at_ms: number | null;
    status: string | null;
    error: string | null;
    duration_ms: number | null;
    model: string | null;
    summary: string | null;
    session_id: string | null;
    cost_usd: number | null;
  }>;

  return rows.map((r) => ({
    ts: r.ts,
    runAtMs: r.run_at_ms,
    status: r.status,
    error: r.error,
    durationMs: r.duration_ms,
    model: r.model,
    summary: r.summary,
    sessionId: r.session_id,
    costUsd: r.cost_usd,
  }));
}

export function getRecentErrors(
  db: Database.Database,
  limit = 10
): Array<{ jobId: string; ts: number; error: string }> {
  return db
    .prepare(
      `
    SELECT job_id as jobId, ts, error
    FROM cron_runs
    WHERE status = 'error' AND error IS NOT NULL
    ORDER BY ts DESC
    LIMIT ?
  `
    )
    .all(limit) as Array<{ jobId: string; ts: number; error: string }>;
}
