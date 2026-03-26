/**
 * Cron data reader — reads job definitions and syncs run history to SQLite
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type Database from 'better-sqlite3';

// ── Types ──

export interface CronJob {
  id: string;
  name: string;
  agentId: string;
  enabled: boolean;
  schedule: CronSchedule;
  payload: unknown;
  state: CronJobState;
  sessionTarget?: string;
  wakeMode?: string;
  deleteAfterRun?: boolean;
  description?: string;
  delivery?: Record<string, unknown>;
  createdAtMs?: number;
  updatedAtMs?: number;
}

export type CronSchedule =
  | { kind: 'cron'; expr: string; tz?: string }
  | { kind: 'at'; at: string }
  | { kind: 'every'; everyMs: number };

export interface CronJobState {
  lastRunAtMs?: number;
  lastStatus?: string;
  lastRunStatus?: string;
  lastDurationMs?: number;
  consecutiveErrors?: number;
  nextRunAtMs?: number;
  lastError?: string;
}

interface Logger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

// ── Cache ──

interface CacheEntry {
  data: CronJob[];
  readAt: number;
}

const TTL_MS = 30_000;
let jobsCache: CacheEntry | null = null;

// ── Paths ──

function getCronDir(): string {
  return join(homedir(), '.openclaw', 'cron');
}

function getRunsDir(): string {
  return join(getCronDir(), 'runs');
}

// ── Job reading ──

export function readCronJobs(logger: Logger): CronJob[] {
  const now = Date.now();
  if (jobsCache && now - jobsCache.readAt < TTL_MS) {
    return jobsCache.data;
  }

  const jobsPath = join(getCronDir(), 'jobs.json');
  try {
    if (!existsSync(jobsPath)) {
      logger.warn('[clawlens] Cron jobs.json not found at', jobsPath);
      return jobsCache?.data ?? [];
    }

    const raw = readFileSync(jobsPath, 'utf-8');
    const parsed = JSON.parse(raw);
    const jobs: CronJob[] = Array.isArray(parsed.jobs) ? parsed.jobs : [];
    jobsCache = { data: jobs, readAt: now };
    return jobs;
  } catch (error) {
    logger.warn('[clawlens] Failed to read cron jobs.json:', error);
    return jobsCache?.data ?? [];
  }
}

// ── JSONL → SQLite sync ──

const INSERT_SQL = `
  INSERT OR IGNORE INTO cron_runs
    (job_id, ts, run_at_ms, status, error, duration_ms, model, provider,
     summary, session_id, session_key, delivered, tokens_in, tokens_out)
  VALUES
    (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

export function syncCronRuns(db: Database.Database, logger: Logger): number {
  const runsDir = getRunsDir();
  if (!existsSync(runsDir)) {
    logger.info('[clawlens] No cron runs directory found, skipping sync');
    return 0;
  }

  // Get max ts per job_id already in DB for incremental sync
  const maxTsRows = db
    .prepare('SELECT job_id, MAX(ts) as max_ts FROM cron_runs GROUP BY job_id')
    .all() as Array<{ job_id: string; max_ts: number }>;
  const maxTsMap = new Map(maxTsRows.map((r) => [r.job_id, r.max_ts]));

  const files = readdirSync(runsDir).filter((f) => f.endsWith('.jsonl'));
  const insert = db.prepare(INSERT_SQL);
  let totalInserted = 0;

  const batchInsert = db.transaction((rows: unknown[][]) => {
    for (const row of rows) {
      insert.run(...row);
      totalInserted++;
    }
  });

  for (const file of files) {
    const jobId = file.replace('.jsonl', '');
    const maxTs = maxTsMap.get(jobId) ?? 0;

    try {
      const content = readFileSync(join(runsDir, file), 'utf-8');
      const rows: unknown[][] = [];

      for (const line of content.split('\n')) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line);
          if (!entry.ts || entry.ts <= maxTs) continue;

          // Parse sessionId from sessionKey if not directly available
          const sessionId =
            entry.sessionId || parseSessionId(entry.sessionKey) || null;

          rows.push([
            entry.jobId || jobId,
            entry.ts,
            entry.runAtMs || null,
            entry.status || null,
            entry.error || null,
            entry.durationMs || null,
            entry.model || null,
            entry.provider || null,
            entry.summary || null,
            sessionId,
            entry.sessionKey || null,
            entry.deliveryStatus === 'delivered' ? 1 : 0,
            entry.usage?.input_tokens || null,
            entry.usage?.output_tokens || null,
          ]);
        } catch {
          // Skip unparseable lines
        }
      }

      if (rows.length > 0) {
        batchInsert(rows);
      }
    } catch (error) {
      logger.warn(`[clawlens] Failed to read cron run file ${file}:`, error);
    }
  }

  if (totalInserted > 0) {
    logger.info(`[clawlens] Synced ${totalInserted} cron run entries`);
  }
  return totalInserted;
}

function parseSessionId(sessionKey: string | undefined): string | null {
  if (!sessionKey) return null;
  // Format: agent:<agentId>:cron:<jobId>:run:<sessionId>
  const match = sessionKey.match(/:run:(.+)$/);
  return match?.[1] ?? null;
}
