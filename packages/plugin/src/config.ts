/**
 * Configuration loader for ClawLens plugin
 *
 * Loads configuration from clawlens.config.yaml or OpenClaw plugin config,
 * merges with defaults, and validates values.
 */

import { readFileSync, accessSync, constants, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { parse as parseYaml } from 'yaml';

/**
 * ClawLens plugin configuration interface
 */
export interface ClawLensConfig {
  /** Whether the plugin is enabled */
  enabled: boolean;

  /** Path to SQLite database file */
  dbPath: string;

  /** Number of days to retain spans before auto-pruning */
  retentionDays: number;

  /** Whether to import existing JSONL sessions on startup */
  backfillOnStart: boolean;

  /** Directory containing JSONL session files for backfill */
  sessionsDir: string;

  /** Cost threshold (USD) to log warning */
  costAlertThresholdUsd: number;

  /** Agent IDs to exclude from capture */
  excludeAgents: string[];

  /** Channel names to exclude from capture */
  excludeChannels: string[];

  /** Enable verbose logging */
  verbose: boolean;

  /** Enable demo mode (auto-import fixture sessions) */
  demo?: boolean;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: ClawLensConfig = {
  enabled: true,
  dbPath: '~/.openclaw/clawlens/clawlens.db',
  retentionDays: 90,
  backfillOnStart: true,
  sessionsDir: '~/.openclaw/agents',
  costAlertThresholdUsd: 10.0,
  excludeAgents: [],
  excludeChannels: [],
  verbose: false,
};

/**
 * Configuration validation errors
 */
export class ConfigValidationError extends Error {
  constructor(
    message: string,
    public field: string
  ) {
    super(`Config validation error: ${field} - ${message}`);
    this.name = 'ConfigValidationError';
  }
}

/**
 * Expand ~ to home directory in paths
 */
export function expandPath(path: string): string {
  if (path.startsWith('~/')) {
    return join(homedir(), path.slice(2));
  }
  if (path.startsWith('~')) {
    return join(homedir(), path.slice(1));
  }
  return path;
}

/**
 * Ensure directory exists for path
 */
export function ensureDir(filePath: string): void {
  const dir = dirname(filePath);
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    // Directory might already exist
  }
}


/**
 * Validate configuration values
 */
export function validateConfig(config: ClawLensConfig): void {
  // Validate retention_days
  if (typeof config.retentionDays !== 'number' || config.retentionDays <= 0) {
    throw new ConfigValidationError('must be a positive number', 'retentionDays');
  }

  // Validate db_path is potentially writable (warning only)
  const expandedDbPath = expandPath(config.dbPath);
  if (expandedDbPath !== ':memory:') {
    // Try to ensure directory exists
    try {
      ensureDir(expandedDbPath);
    } catch {
      console.warn(
        `[clawlens] Warning: Could not create database directory: ${dirname(expandedDbPath)}`
      );
    }
  }

  // Validate cost threshold
  if (typeof config.costAlertThresholdUsd !== 'number' || config.costAlertThresholdUsd < 0) {
    throw new ConfigValidationError('must be a non-negative number', 'costAlertThresholdUsd');
  }

  // Validate exclude arrays
  if (!Array.isArray(config.excludeAgents)) {
    throw new ConfigValidationError('must be an array', 'excludeAgents');
  }
  if (!Array.isArray(config.excludeChannels)) {
    throw new ConfigValidationError('must be an array', 'excludeChannels');
  }
}

/**
 * Load configuration from YAML file
 */
function loadYamlConfig(configPath: string): Partial<ClawLensConfig> {
  try {
    const content = readFileSync(configPath, 'utf-8');
    const parsed = parseYaml(content);

    if (!parsed || typeof parsed !== 'object') {
      return {};
    }

    // Support both flat and nested format
    const rawConfig = parsed.clawlens || parsed;

    // Map YAML snake_case to camelCase
    return {
      enabled: rawConfig.enabled,
      dbPath: rawConfig.db_path ?? rawConfig.dbPath,
      retentionDays: rawConfig.retention_days ?? rawConfig.retentionDays,
      backfillOnStart: rawConfig.backfill_on_start ?? rawConfig.backfillOnStart,
      sessionsDir: rawConfig.sessions_dir ?? rawConfig.sessionsDir,
      costAlertThresholdUsd:
        rawConfig.cost_alert_threshold_usd ?? rawConfig.costAlertThresholdUsd,
      excludeAgents: rawConfig.exclude_agents ?? rawConfig.excludeAgents,
      excludeChannels: rawConfig.exclude_channels ?? rawConfig.excludeChannels,
      verbose: rawConfig.verbose,
      demo: rawConfig.demo,
    };
  } catch {
    // File doesn't exist or is invalid - return empty config
    return {};
  }
}

/**
 * Find config file in standard locations
 */
function findConfigFile(workspaceDir?: string): string | null {
  const configNames = ['clawlens.config.yaml', 'clawlens.config.yml', 'clawlens.yaml'];
  const searchDirs = [
    workspaceDir,
    process.cwd(),
    join(homedir(), '.openclaw'),
    homedir(),
  ].filter(Boolean) as string[];

  for (const dir of searchDirs) {
    for (const name of configNames) {
      const configPath = join(dir, name);
      try {
        accessSync(configPath, constants.R_OK);
        return configPath;
      } catch {
        // Continue searching
      }
    }
  }

  return null;
}

/**
 * Load and merge configuration from all sources
 *
 * Priority (highest to lowest):
 * 1. Explicit options passed to function
 * 2. OpenClaw plugin config (api.config)
 * 3. clawlens.config.yaml file
 * 4. Default values
 *
 * @param pluginConfig - Configuration from OpenClaw plugin API
 * @param workspaceDir - OpenClaw workspace directory
 * @returns Merged and validated configuration
 */
export function loadConfig(
  pluginConfig: Partial<ClawLensConfig> = {},
  workspaceDir?: string
): ClawLensConfig {
  // Load from YAML file if found
  const configFile = findConfigFile(workspaceDir);
  const yamlConfig = configFile ? loadYamlConfig(configFile) : {};

  // Merge configs with priority
  const config: ClawLensConfig = {
    ...DEFAULT_CONFIG,
    ...removeUndefined(yamlConfig),
    ...removeUndefined(pluginConfig),
  };

  // Validate
  validateConfig(config);

  return config;
}

/**
 * Remove undefined values from object
 */
function removeUndefined<T extends object>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      (result as Record<string, unknown>)[key] = value;
    }
  }
  return result;
}

/**
 * Resolve and normalize plugin configuration (legacy interface)
 */
export function resolveConfig(config: Partial<ClawLensConfig>): ClawLensConfig {
  return loadConfig(config);
}
