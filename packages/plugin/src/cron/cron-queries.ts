/**
 * Cron SQL queries — stats, summaries, and run history from cron_runs table
 */

import type Database from 'better-sqlite3';
import type { CronJob } from './cron-reader.js';

// ── Model pricing fallback ──
// Per-token pricing (USD per token) for models where OpenClaw doesn't supply cost.
// Used as fallback when span cost_usd is 0.
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'minimax-m2.7:cloud': { input: 0.30 / 1_000_000, output: 1.20 / 1_000_000 },
  'deepseek-v3.2:cloud': { input: 0.28 / 1_000_000, output: 0.40 / 1_000_000 },
};

function estimateCost(
  model: string | null,
  tokensIn: number | null,
  tokensOut: number | null
): number | null {
  if (!model || !tokensIn) return null;
  const pricing = MODEL_PRICING[model];
  if (!pricing) return null;
  return (tokensIn * pricing.input) + ((tokensOut ?? 0) * pricing.output);
}

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
  tokensIn: number | null;
  tokensOut: number | null;
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
  tokensIn: number | null;
  tokensOut: number | null;
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

  // Estimate daily cost: sum cost from spans (with pricing fallback) for runs in last 7 days
  const costRows = db
    .prepare(
      `
    SELECT cr.model, cr.tokens_in, cr.tokens_out,
      COALESCE((SELECT SUM(cost_usd) FROM spans WHERE session_id = cr.session_id AND span_type = 'llm_call'), 0) as span_cost
    FROM cron_runs cr
    WHERE cr.run_at_ms > ? AND cr.status = 'ok'
  `
    )
    .all(Date.now() - 7 * 86400_000) as Array<{
    model: string | null;
    tokens_in: number | null;
    tokens_out: number | null;
    span_cost: number;
  }>;

  let totalCost = 0;
  for (const row of costRows) {
    if (row.span_cost > 0) {
      totalCost += row.span_cost;
    } else {
      totalCost += estimateCost(row.model, row.tokens_in, row.tokens_out) ?? 0;
    }
  }
  const estimatedDailyCostUsd = costRows.length > 0 ? totalCost / 7 : null;

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

  // Last run cost (sum of LLM call costs) and tokens, with model for pricing fallback
  const costStmt = db.prepare(`
    SELECT
      (SELECT SUM(cost_usd) FROM spans WHERE session_id = cr.session_id AND span_type = 'llm_call') as cost_usd,
      cr.tokens_in, cr.tokens_out, cr.model
    FROM cron_runs cr
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
      | { cost_usd: number | null; tokens_in: number | null; tokens_out: number | null; model: string | null }
      | undefined;

    const spanCost = costRow?.cost_usd;
    const lastRunCostUsd = (spanCost && spanCost > 0)
      ? spanCost
      : estimateCost(costRow?.model ?? null, costRow?.tokens_in ?? null, costRow?.tokens_out ?? null);

    return {
      ...job,
      avgDurationMs: stats?.avg_duration_ms ?? null,
      lastRunCostUsd,
      tokensIn: costRow?.tokens_in ?? null,
      tokensOut: costRow?.tokens_out ?? null,
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
      cr.tokens_in, cr.tokens_out,
      (SELECT SUM(cost_usd) FROM spans WHERE session_id = cr.session_id AND span_type = 'llm_call') as cost_usd
    FROM cron_runs cr
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
    tokens_in: number | null;
    tokens_out: number | null;
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
    tokensIn: r.tokens_in,
    tokensOut: r.tokens_out,
    costUsd: (r.cost_usd && r.cost_usd > 0)
      ? r.cost_usd
      : estimateCost(r.model, r.tokens_in, r.tokens_out),
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
