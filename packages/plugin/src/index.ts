/**
 * ClawLens OpenClaw Plugin
 *
 * Entry point for the ClawLens observability plugin.
 * Registers lifecycle hooks and HTTP routes for session replay, analytics, and topology.
 */

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Re-export database layer
export * from './db/index.js';

// Re-export hooks
export * from './hooks/index.js';

// Re-export importers
export * from './importers/jsonl.js';

// Re-export config (excluding conflicting names)
export {
  ClawLensConfig,
  DEFAULT_CONFIG,
  ConfigValidationError,
  validateConfig,
  loadConfig,
  resolveConfig,
} from './config.js';

// Re-export API
export * from './api/index.js';

// Internal imports
import { getDb, closeDb } from './db/connection.js';
import { SpanWriter } from './db/writer.js';
import { SpanReader } from './db/reader.js';
import { registerHooks, type PluginAPI } from './hooks/index.js';
import { registerRoutes, type PluginRouteConfig } from './api/routes.js';
import { importDirectory } from './importers/jsonl.js';
import { loadConfig, expandPath, type ClawLensConfig } from './config.js';
import { initializeDemoIfNeeded } from './demo.js';
import { OpenClawConfigReader } from './config/openclaw-config.js';
import { syncCronRuns } from './cron/cron-reader.js';
import { FlowBus } from './events/flow-bus.js';
import { captureSnapshots, resolveWorkspaceRoot } from './memory/scanner.js';

/**
 * Get the UI dist path (relative to this file when bundled)
 */
function getUiDistPath(): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    // UI is built to dist/ui/ directory
    return join(__dirname, 'ui');
  } catch {
    // Fallback for environments where import.meta.url doesn't work
    return join(process.cwd(), 'dist', 'ui');
  }
}

/**
 * Plugin state (module-level for cleanup)
 */
const pluginState: {
  writer: SpanWriter | null;
  reader: SpanReader | null;
  config: ClawLensConfig | null;
  cronSyncInterval: ReturnType<typeof setInterval> | null;
  memorySnapshotInterval: ReturnType<typeof setInterval> | null;
  flowBus: FlowBus | null;
} = {
  writer: null,
  reader: null,
  config: null,
  cronSyncInterval: null,
  memorySnapshotInterval: null,
  flowBus: null,
};

/**
 * ClawLens plugin registration function
 *
 * This function is called by OpenClaw when the plugin is loaded.
 * All hook and route registration must happen synchronously within this function.
 *
 * @param api - OpenClaw Plugin API
 */
function register(api: PluginAPI): void {
  const logger = api.logger;

  logger.info('[clawlens] Initializing ClawLens plugin');

  try {
    // Load and validate configuration
    const config = loadConfig(api.config as Partial<ClawLensConfig>);
    pluginState.config = config;

    // Check if plugin is enabled
    if (!config.enabled) {
      logger.info('[clawlens] Plugin is disabled via configuration');
      return;
    }

    // Lazy DB initialization — deferred until first actual use.
    // This prevents the better-sqlite3 native module from loading during
    // plugin registration, which would crash when the CLI (Node 25) validates
    // the plugin. The Gateway (Node 22) loads it on first hook/API call.
    type DbResources = { db: ReturnType<typeof getDb>; writer: SpanWriter; reader: SpanReader };
    let dbResources: DbResources | null = null;
    let dbInitStarted = false;

    function ensureDb(): DbResources {
      if (!dbResources) {
        const dbPath = expandPath(config.dbPath);
        logger.info(`[clawlens] Initializing database at ${dbPath}`);
        const db = getDb({ path: dbPath });
        const writer = new SpanWriter(db);
        const reader = new SpanReader(db);
        dbResources = { db, writer, reader };
        pluginState.writer = writer;
        pluginState.reader = reader;
      }
      return dbResources;
    }

    // Proxy wrappers: hooks and routes receive these immediately,
    // but the native module only loads on first property access.
    const lazyWriter = new Proxy({} as SpanWriter, {
      get(_, prop) {
        const { writer } = ensureDb();
        const value = (writer as any)[prop];
        return typeof value === 'function' ? value.bind(writer) : value;
      },
    });

    const lazyReader = new Proxy({} as SpanReader, {
      get(_, prop) {
        const { reader } = ensureDb();
        const value = (reader as any)[prop];
        return typeof value === 'function' ? value.bind(reader) : value;
      },
    });

    // Create flow event bus for live visualization
    const flowBus = new FlowBus(100);
    pluginState.flowBus = flowBus;

    // Register lifecycle hooks (uses lazy writer — no DB load yet)
    logger.info('[clawlens] Registering lifecycle hooks');
    registerHooks(api, lazyWriter, flowBus);

    // Initialize OpenClaw config reader for agent metadata
    const configReader = new OpenClawConfigReader(undefined, logger);

    // Register HTTP routes (uses lazy reader — no DB load yet)
    const uiDistPath = getUiDistPath();
    logger.info(`[clawlens] Registering HTTP routes (UI path: ${uiDistPath})`);

    // Lazy DB proxy for cron routes
    const lazyDb = new Proxy({} as ReturnType<typeof getDb>, {
      get(_, prop) {
        const { db } = ensureDb();
        const value = (db as any)[prop];
        return typeof value === 'function' ? value.bind(db) : value;
      },
    });

    registerRoutes(
      (route: PluginRouteConfig) => api.registerHttpRoute(route),
      lazyReader,
      uiDistPath,
      logger,
      configReader,
      lazyDb,
      flowBus
    );

    // Deferred startup tasks: cron sync, demo/backfill
    // Runs on next tick so registration completes first.
    setTimeout(() => {
      if (dbInitStarted) return;
      dbInitStarted = true;
      try {
        const { db, reader, writer } = ensureDb();

        // Sync cron run data from JSONL files into SQLite
        try {
          syncCronRuns(db, logger);
        } catch (error) {
          logger.warn('[clawlens] Initial cron sync failed:', error);
        }
        // Periodic re-sync every 60s
        pluginState.cronSyncInterval = setInterval(() => {
          try {
            syncCronRuns(db, logger);
          } catch (error) {
            logger.warn('[clawlens] Periodic cron sync failed:', error);
          }
        }, 60_000);

        // Memory file snapshots — initial scan then every 5 minutes
        const workspaceRoot = resolveWorkspaceRoot();
        try {
          captureSnapshots(db, workspaceRoot, logger);
        } catch (error) {
          logger.warn(`[clawlens] Initial memory snapshot scan failed: ${error instanceof Error ? error.message : String(error)}`);
        }
        pluginState.memorySnapshotInterval = setInterval(() => {
          try {
            captureSnapshots(db, workspaceRoot, logger);
          } catch (error) {
            logger.warn(`[clawlens] Periodic memory snapshot failed: ${error instanceof Error ? error.message : String(error)}`);
          }
        }, 5 * 60_000);

        // Initialize demo mode if needed (or run backfill)
        initializeDemoMode(reader, writer, config, logger).catch((error) => {
          logger.error('[clawlens] Demo/backfill initialization failed:', error);
        });
      } catch (error) {
        logger.error('[clawlens] Deferred DB initialization failed:', error);
      }
    }, 0);

    // Log startup summary
    logger.info('[clawlens] Plugin registered successfully (DB deferred)', {
      dbPath: config.dbPath,
      retentionDays: config.retentionDays,
      backfillOnStart: config.backfillOnStart,
      excludeAgents: config.excludeAgents,
      excludeChannels: config.excludeChannels,
    });
  } catch (error) {
    logger.error('[clawlens] Failed to initialize plugin:', error);
    throw error;
  }
}

/**
 * Initialize demo mode or run backfill
 */
async function initializeDemoMode(
  reader: SpanReader,
  writer: SpanWriter,
  config: ClawLensConfig & { demo?: boolean },
  logger: { info: (msg: string, ...args: unknown[]) => void; error: (msg: string, ...args: unknown[]) => void }
): Promise<void> {
  // Try demo mode first
  await initializeDemoIfNeeded(reader, writer, config, logger);

  // Always run backfill if enabled — real sessions should be
  // imported alongside demo data
  if (config.backfillOnStart) {
    const sessionsDir = expandPath(config.sessionsDir);
    logger.info(`[clawlens] Starting JSONL backfill from ${sessionsDir}`);
    await runBackfill(sessionsDir, writer, logger);
  }
}

/**
 * Run JSONL backfill asynchronously
 */
async function runBackfill(
  sessionsDir: string,
  writer: SpanWriter,
  logger: { info: (msg: string, ...args: unknown[]) => void }
): Promise<void> {
  try {
    // Import all JSONL files from the sessions directory
    const pattern = join(sessionsDir, '**', '*.jsonl');
    const results = await importDirectory(pattern, writer);

    // Summarize results
    const imported = results.filter((r) => !r.skipped);
    const skipped = results.filter((r) => r.skipped);
    const errors = results.filter((r) => r.errors.length > 0);

    const totalSpans = imported.reduce((sum, r) => sum + r.spansCreated, 0);

    logger.info(`[clawlens] Backfill complete`, {
      filesProcessed: results.length,
      filesImported: imported.length,
      filesSkipped: skipped.length,
      filesWithErrors: errors.length,
      spansCreated: totalSpans,
    });
  } catch (error) {
    logger.info(`[clawlens] Backfill error: ${error}`);
  }
}

// Attach plugin metadata to the register function
register.id = 'clawlens';

// Export as default
export default register;

/**
 * Plugin shutdown handler
 *
 * Called when the Gateway is shutting down.
 * Clean up database connections and other resources.
 */
export function shutdown(): void {
  try {
    if (pluginState.cronSyncInterval) {
      clearInterval(pluginState.cronSyncInterval);
      pluginState.cronSyncInterval = null;
    }
    if (pluginState.memorySnapshotInterval) {
      clearInterval(pluginState.memorySnapshotInterval);
      pluginState.memorySnapshotInterval = null;
    }
    closeDb();
    pluginState.writer = null;
    pluginState.reader = null;
    console.log('[clawlens] Plugin shutdown complete');
  } catch (error) {
    console.error('[clawlens] Error during shutdown:', error);
  }
}

/**
 * Get the current plugin state (for testing)
 */
export function getPluginState(): typeof pluginState {
  return pluginState;
}
