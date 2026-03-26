/**
 * SQLite database schema for ClawLens
 *
 * Validated schema from research/schema-validation.md
 */

import type Database from 'better-sqlite3';

/**
 * Current schema version - increment when making schema changes
 */
export const SCHEMA_VERSION = 2;

/**
 * DDL for spans table - the core data store
 */
export const CREATE_SPANS_TABLE = `
CREATE TABLE IF NOT EXISTS spans (
  -- Identity
  id            TEXT PRIMARY KEY,
  trace_id      TEXT NOT NULL,
  parent_id     TEXT,

  -- OpenClaw identifiers
  session_id    TEXT NOT NULL,
  session_key   TEXT,
  agent_id      TEXT NOT NULL,

  -- Context
  channel       TEXT,
  account_id    TEXT,
  conversation_id TEXT,

  -- Classification
  span_type     TEXT NOT NULL,
  name          TEXT NOT NULL,

  -- Timing
  start_ts      INTEGER NOT NULL,
  end_ts        INTEGER,
  duration_ms   INTEGER GENERATED ALWAYS AS (end_ts - start_ts) STORED,

  -- Cost & Tokens (primarily from JSONL)
  tokens_in     INTEGER DEFAULT 0,
  tokens_out    INTEGER DEFAULT 0,
  cost_usd      REAL DEFAULT 0.0,
  cost_input_usd REAL DEFAULT 0.0,
  cost_output_usd REAL DEFAULT 0.0,
  model         TEXT,
  provider      TEXT,

  -- Outcome
  status        TEXT DEFAULT 'ok',
  error_message TEXT,

  -- Execution context (from hooks)
  run_id        TEXT,
  sequence_num  INTEGER,

  -- Source tracking
  source        TEXT DEFAULT 'hook',

  -- Flexible payload
  metadata      TEXT DEFAULT '{}',

  -- Internal timestamp
  created_at    INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
);
`;

/**
 * DDL for indexes on spans table
 */
export const CREATE_SPANS_INDEXES = `
-- Primary query indexes
CREATE INDEX IF NOT EXISTS idx_spans_trace ON spans(trace_id);
CREATE INDEX IF NOT EXISTS idx_spans_session ON spans(session_id);
CREATE INDEX IF NOT EXISTS idx_spans_agent ON spans(agent_id);
CREATE INDEX IF NOT EXISTS idx_spans_type ON spans(span_type);
CREATE INDEX IF NOT EXISTS idx_spans_status ON spans(status);
CREATE INDEX IF NOT EXISTS idx_spans_time ON spans(start_ts);
CREATE INDEX IF NOT EXISTS idx_spans_parent ON spans(parent_id);
CREATE INDEX IF NOT EXISTS idx_spans_model ON spans(model);

-- Additional indexes for common queries
CREATE INDEX IF NOT EXISTS idx_spans_channel ON spans(channel);
CREATE INDEX IF NOT EXISTS idx_spans_run ON spans(run_id);
CREATE INDEX IF NOT EXISTS idx_spans_source ON spans(source);

-- Composite index for session list query
CREATE INDEX IF NOT EXISTS idx_spans_session_type ON spans(session_id, span_type);
`;

/**
 * DDL for daily_stats table - pre-aggregated statistics
 */
export const CREATE_DAILY_STATS_TABLE = `
CREATE TABLE IF NOT EXISTS daily_stats (
  date          TEXT NOT NULL,
  agent_id      TEXT NOT NULL,
  channel       TEXT,
  model         TEXT,
  total_spans   INTEGER DEFAULT 0,
  total_errors  INTEGER DEFAULT 0,
  total_cost    REAL DEFAULT 0.0,
  total_tokens  INTEGER DEFAULT 0,
  avg_duration  REAL DEFAULT 0.0,
  PRIMARY KEY (date, agent_id, channel, model)
);
`;

/**
 * DDL for imports table - tracks processed JSONL files
 */
export const CREATE_IMPORTS_TABLE = `
CREATE TABLE IF NOT EXISTS imports (
  file_path     TEXT PRIMARY KEY,
  file_hash     TEXT NOT NULL,
  imported_at   INTEGER NOT NULL,
  spans_created INTEGER DEFAULT 0
);
`;

/**
 * DDL for schema_version table - migration tracking
 */
export const CREATE_SCHEMA_VERSION_TABLE = `
CREATE TABLE IF NOT EXISTS schema_version (
  version       INTEGER PRIMARY KEY,
  applied_at    INTEGER NOT NULL
);
`;

/**
 * DDL for cron_runs table — synced from JSONL run files
 */
export const CREATE_CRON_RUNS_TABLE = `
CREATE TABLE IF NOT EXISTS cron_runs (
  row_id        INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id        TEXT    NOT NULL,
  ts            INTEGER NOT NULL,
  run_at_ms     INTEGER,
  status        TEXT,
  error         TEXT,
  duration_ms   INTEGER,
  model         TEXT,
  provider      TEXT,
  summary       TEXT,
  session_id    TEXT,
  session_key   TEXT,
  delivered     INTEGER DEFAULT 0,
  tokens_in     INTEGER,
  tokens_out    INTEGER,
  UNIQUE(job_id, ts)
);
`;

/**
 * DDL for cron_runs indexes
 */
export const CREATE_CRON_RUNS_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_cron_runs_job_time ON cron_runs(job_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_cron_runs_status ON cron_runs(status) WHERE status = 'error';
`;

/**
 * All table creation statements in order
 */
export const TABLE_DDL = [
  CREATE_SPANS_TABLE,
  CREATE_DAILY_STATS_TABLE,
  CREATE_IMPORTS_TABLE,
  CREATE_SCHEMA_VERSION_TABLE,
  CREATE_CRON_RUNS_TABLE,
];

/**
 * All index creation statements
 */
export const INDEX_DDL = [CREATE_SPANS_INDEXES, CREATE_CRON_RUNS_INDEXES];

/**
 * Get current schema version from database
 */
export function getCurrentVersion(db: Database.Database): number {
  try {
    const row = db.prepare('SELECT MAX(version) as version FROM schema_version').get() as
      | { version: number | null }
      | undefined;
    return row?.version ?? 0;
  } catch {
    // Table doesn't exist yet
    return 0;
  }
}

/**
 * Record schema version in database
 */
export function recordVersion(db: Database.Database, version: number): void {
  db.prepare('INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES (?, ?)').run(
    version,
    Date.now()
  );
}

/**
 * Run all migrations to bring database up to current version
 *
 * @param db - Database connection
 * @returns true if migrations were applied, false if already up to date
 */
export function migrate(db: Database.Database): boolean {
  const currentVersion = getCurrentVersion(db);

  if (currentVersion >= SCHEMA_VERSION) {
    return false; // Already up to date
  }

  // Run migrations in a transaction
  const runMigrations = db.transaction(() => {
    // Apply all table DDL (IF NOT EXISTS makes these safe to re-run)
    for (const ddl of TABLE_DDL) {
      db.exec(ddl);
    }

    // Apply all index DDL
    for (const ddl of INDEX_DDL) {
      db.exec(ddl);
    }

    // Record the new version
    recordVersion(db, SCHEMA_VERSION);
  });

  runMigrations();
  return true;
}

/**
 * Check if schema needs migration
 */
export function needsMigration(db: Database.Database): boolean {
  return getCurrentVersion(db) < SCHEMA_VERSION;
}
