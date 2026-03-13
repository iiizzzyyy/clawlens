/**
 * SQLite database connection management
 *
 * Provides singleton access to the database with WAL mode enabled.
 */

import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { migrate } from './schema.js';

/**
 * Default database path
 */
export const DEFAULT_DB_PATH = '~/.openclaw/clawlens/clawlens.db';

/**
 * Singleton database instance
 */
let dbInstance: Database.Database | null = null;

/**
 * Path to current database (for singleton tracking)
 */
let currentDbPath: string | null = null;

/**
 * Expand tilde (~) in path to home directory
 */
export function expandPath(path: string): string {
  if (path.startsWith('~/')) {
    return resolve(homedir(), path.slice(2));
  }
  if (path.startsWith('~')) {
    return resolve(homedir(), path.slice(1));
  }
  return resolve(path);
}

/**
 * Ensure parent directories exist for a file path
 */
export function ensureDir(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Database connection options
 */
export interface DbOptions {
  /**
   * Path to SQLite database file
   * Supports ~ for home directory
   * Use ":memory:" for in-memory database
   */
  path?: string;

  /**
   * Enable verbose logging
   */
  verbose?: boolean;

  /**
   * Force creating a new connection even if one exists
   */
  forceNew?: boolean;
}

/**
 * Get or create the database connection
 *
 * Opens SQLite with WAL mode for better concurrent read performance.
 * Runs migrations on first connection.
 *
 * @param options - Connection options
 * @returns Database instance
 */
export function getDb(options: DbOptions = {}): Database.Database {
  const { path = DEFAULT_DB_PATH, verbose = false, forceNew = false } = options;

  const expandedPath = path === ':memory:' ? ':memory:' : expandPath(path);

  // Return existing connection if same path and not forcing new
  if (dbInstance && currentDbPath === expandedPath && !forceNew) {
    return dbInstance;
  }

  // Close existing connection if switching paths
  if (dbInstance && currentDbPath !== expandedPath) {
    closeDb();
  }

  // Ensure parent directory exists (unless in-memory)
  if (expandedPath !== ':memory:') {
    ensureDir(expandedPath);
  }

  // Create new connection
  dbInstance = new Database(expandedPath, {
    verbose: verbose ? console.log : undefined,
  });
  currentDbPath = expandedPath;

  // Enable WAL mode for better concurrent read performance
  dbInstance.pragma('journal_mode = WAL');

  // Enable foreign keys
  dbInstance.pragma('foreign_keys = ON');

  // Optimize for write performance
  dbInstance.pragma('synchronous = NORMAL');

  // Run migrations
  migrate(dbInstance);

  return dbInstance;
}

/**
 * Close the database connection
 */
export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    currentDbPath = null;
  }
}

/**
 * Check if database connection is open
 */
export function isDbOpen(): boolean {
  return dbInstance !== null && dbInstance.open;
}

/**
 * Get the current database path
 */
export function getDbPath(): string | null {
  return currentDbPath;
}

/**
 * Create an in-memory database for testing
 *
 * Each call creates a fresh database with migrations applied.
 *
 * @returns New in-memory database instance
 */
export function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}
