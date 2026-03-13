/**
 * Demo mode for ClawLens
 *
 * Automatically imports fixture sessions when demo mode is enabled
 * or when no real sessions exist in the database.
 */

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import type { SpanWriter } from './db/writer.js';
import type { SpanReader } from './db/reader.js';
import { importSession } from './importers/jsonl.js';

/**
 * Check if demo mode should be activated
 */
export function shouldEnableDemo(
  reader: SpanReader,
  config: { demo?: boolean }
): boolean {
  // Explicit demo mode in config
  if (config.demo === true) {
    return true;
  }

  // Auto-enable if no sessions exist
  try {
    const sessions = reader.getSessionList({ limit: 1 });
    return sessions.length === 0;
  } catch {
    // If query fails, assume we need demo data
    return true;
  }
}

/**
 * Get path to demo fixtures directory
 */
export function getDemoFixturesPath(): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    // From dist/demo.js -> fixtures/demo/
    return join(__dirname, '..', 'fixtures', 'demo');
  } catch {
    // Fallback for environments where import.meta.url doesn't work
    return join(process.cwd(), 'fixtures', 'demo');
  }
}

/**
 * Get list of demo session files
 */
export function getDemoSessionFiles(): string[] {
  const demoDir = getDemoFixturesPath();

  if (!existsSync(demoDir)) {
    return [];
  }

  return [
    join(demoDir, 'session-simple-qa.jsonl'),
    join(demoDir, 'session-tool-heavy.jsonl'),
    join(demoDir, 'session-expensive.jsonl'),
    join(demoDir, 'session-failed.jsonl'),
    join(demoDir, 'session-delegation.jsonl'),
    join(demoDir, 'session-cron.jsonl'),
    join(demoDir, 'session-code-gen.jsonl'),
  ].filter(existsSync);
}

/**
 * Import demo fixtures into the database
 */
export async function importDemoFixtures(
  writer: SpanWriter,
  logger: { info: (msg: string, ...args: unknown[]) => void }
): Promise<number> {
  const files = getDemoSessionFiles();

  if (files.length === 0) {
    logger.info('[clawlens] No demo fixtures found');
    return 0;
  }

  logger.info(`[clawlens] Importing ${files.length} demo sessions...`);

  let totalSpans = 0;
  for (const file of files) {
    try {
      const result = await importSession(file, writer);
      totalSpans += result.spansCreated;

      if (result.errors.length > 0) {
        logger.info(`[clawlens] Warning: ${result.errors.length} errors in ${file}`);
      }
    } catch (error) {
      logger.info(`[clawlens] Failed to import ${file}:`, error);
    }
  }

  logger.info(`[clawlens] Demo import complete: ${totalSpans} spans created from ${files.length} sessions`);
  return totalSpans;
}

/**
 * Initialize demo mode if needed
 */
export async function initializeDemoIfNeeded(
  reader: SpanReader,
  writer: SpanWriter,
  config: { demo?: boolean },
  logger: { info: (msg: string, ...args: unknown[]) => void }
): Promise<boolean> {
  if (!shouldEnableDemo(reader, config)) {
    return false;
  }

  logger.info('[clawlens] Demo mode enabled - importing demo sessions');
  await importDemoFixtures(writer, logger);
  return true;
}
