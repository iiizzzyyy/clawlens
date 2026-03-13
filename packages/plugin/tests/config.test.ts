/**
 * Tests for configuration loading and validation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, unlinkSync, mkdirSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  loadConfig,
  resolveConfig,
  validateConfig,
  expandPath,
  ensureDir,
  DEFAULT_CONFIG,
  ConfigValidationError,
} from '../src/config.js';

// =============================================================================
// Test Helpers
// =============================================================================

function createTempDir(): string {
  const tempPath = join(tmpdir(), `clawlens-test-${randomUUID()}`);
  mkdirSync(tempPath, { recursive: true });
  return tempPath;
}

function writeYamlConfig(dir: string, filename: string, content: string): string {
  const configPath = join(dir, filename);
  writeFileSync(configPath, content, 'utf-8');
  return configPath;
}

async function cleanupTempDir(dir: string): Promise<void> {
  try {
    const fs = await import('node:fs');
    const files = fs.readdirSync(dir);
    for (const file of files) {
      unlinkSync(join(dir, file));
    }
    rmdirSync(dir);
  } catch {
    // Ignore cleanup errors
  }
}

// =============================================================================
// Tests
// =============================================================================

describe('Configuration Loading', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it('should load default configuration when no config file exists', () => {
    const config = loadConfig({}, tempDir);
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it('should merge YAML config with defaults', () => {
    writeYamlConfig(
      tempDir,
      'clawlens.config.yaml',
      `
clawlens:
  enabled: false
  retention_days: 30
  verbose: true
`
    );

    const config = loadConfig({}, tempDir);
    expect(config.enabled).toBe(false);
    expect(config.retentionDays).toBe(30);
    expect(config.verbose).toBe(true);
    expect(config.dbPath).toBe(DEFAULT_CONFIG.dbPath); // Default value
  });

  it('should support both snake_case and camelCase in YAML', () => {
    writeYamlConfig(
      tempDir,
      'clawlens.config.yaml',
      `
clawlens:
  retention_days: 60
  backfill_on_start: false
  cost_alert_threshold_usd: 5.0
`
    );

    const config = loadConfig({}, tempDir);
    expect(config.retentionDays).toBe(60);
    expect(config.backfillOnStart).toBe(false);
    expect(config.costAlertThresholdUsd).toBe(5.0);
  });

  it('should support flat YAML format (without clawlens key)', () => {
    writeYamlConfig(
      tempDir,
      'clawlens.config.yaml',
      `
enabled: false
retentionDays: 45
verbose: true
`
    );

    const config = loadConfig({}, tempDir);
    expect(config.enabled).toBe(false);
    expect(config.retentionDays).toBe(45);
    expect(config.verbose).toBe(true);
  });

  it('should prioritize plugin config over YAML config', () => {
    writeYamlConfig(
      tempDir,
      'clawlens.config.yaml',
      `
clawlens:
  retention_days: 30
  verbose: false
`
    );

    const config = loadConfig({ retentionDays: 120, verbose: true }, tempDir);
    expect(config.retentionDays).toBe(120); // Plugin config wins
    expect(config.verbose).toBe(true); // Plugin config wins
  });

  it('should load exclude patterns', () => {
    writeYamlConfig(
      tempDir,
      'clawlens.config.yaml',
      `
clawlens:
  exclude_agents:
    - agent-a
    - agent-b
  exclude_channels:
    - test
    - debug
`
    );

    const config = loadConfig({}, tempDir);
    expect(config.excludeAgents).toEqual(['agent-a', 'agent-b']);
    expect(config.excludeChannels).toEqual(['test', 'debug']);
  });

  it('should handle demo mode configuration', () => {
    writeYamlConfig(
      tempDir,
      'clawlens.config.yaml',
      `
clawlens:
  demo: true
`
    );

    const config = loadConfig({}, tempDir);
    expect(config.demo).toBe(true);
  });

  it('should find config in alternative filenames', () => {
    writeYamlConfig(
      tempDir,
      'clawlens.config.yml',
      `
clawlens:
  verbose: true
`
    );

    const config = loadConfig({}, tempDir);
    expect(config.verbose).toBe(true);
  });

  it('should handle invalid YAML gracefully', () => {
    writeYamlConfig(tempDir, 'clawlens.config.yaml', 'invalid: yaml: [');

    const config = loadConfig({}, tempDir);
    expect(config).toEqual(DEFAULT_CONFIG); // Falls back to defaults
  });

  it('should handle empty YAML file', () => {
    writeYamlConfig(tempDir, 'clawlens.config.yaml', '');

    const config = loadConfig({}, tempDir);
    expect(config).toEqual(DEFAULT_CONFIG);
  });
});

describe('Configuration Validation', () => {
  it('should validate valid configuration', () => {
    expect(() => validateConfig(DEFAULT_CONFIG)).not.toThrow();
  });

  it('should reject negative retention days', () => {
    const invalidConfig = { ...DEFAULT_CONFIG, retentionDays: -10 };
    expect(() => validateConfig(invalidConfig)).toThrow(ConfigValidationError);
    expect(() => validateConfig(invalidConfig)).toThrow('retentionDays');
  });

  it('should reject zero retention days', () => {
    const invalidConfig = { ...DEFAULT_CONFIG, retentionDays: 0 };
    expect(() => validateConfig(invalidConfig)).toThrow(ConfigValidationError);
  });

  it('should reject non-number retention days', () => {
    const invalidConfig = { ...DEFAULT_CONFIG, retentionDays: '30' as any };
    expect(() => validateConfig(invalidConfig)).toThrow(ConfigValidationError);
  });

  it('should reject negative cost threshold', () => {
    const invalidConfig = { ...DEFAULT_CONFIG, costAlertThresholdUsd: -5.0 };
    expect(() => validateConfig(invalidConfig)).toThrow(ConfigValidationError);
    expect(() => validateConfig(invalidConfig)).toThrow('costAlertThresholdUsd');
  });

  it('should allow zero cost threshold', () => {
    const validConfig = { ...DEFAULT_CONFIG, costAlertThresholdUsd: 0 };
    expect(() => validateConfig(validConfig)).not.toThrow();
  });

  it('should reject non-array excludeAgents', () => {
    const invalidConfig = { ...DEFAULT_CONFIG, excludeAgents: 'agent-a' as any };
    expect(() => validateConfig(invalidConfig)).toThrow(ConfigValidationError);
    expect(() => validateConfig(invalidConfig)).toThrow('excludeAgents');
  });

  it('should reject non-array excludeChannels', () => {
    const invalidConfig = { ...DEFAULT_CONFIG, excludeChannels: 'slack' as any };
    expect(() => validateConfig(invalidConfig)).toThrow(ConfigValidationError);
    expect(() => validateConfig(invalidConfig)).toThrow('excludeChannels');
  });

  it('should allow :memory: database path', () => {
    const validConfig = { ...DEFAULT_CONFIG, dbPath: ':memory:' };
    expect(() => validateConfig(validConfig)).not.toThrow();
  });
});

describe('Path Expansion', () => {
  it('should expand ~ to home directory', () => {
    const expanded = expandPath('~/test/path');
    expect(expanded).not.toContain('~');
    expect(expanded).toContain('test/path');
  });

  it('should expand ~ without slash', () => {
    const expanded = expandPath('~test');
    expect(expanded).not.toContain('~');
  });

  it('should not expand paths without ~', () => {
    const path = '/absolute/path';
    expect(expandPath(path)).toBe(path);
  });

  it('should handle empty path', () => {
    expect(expandPath('')).toBe('');
  });
});

describe('Directory Creation', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it('should create nested directories', async () => {
    const dbPath = join(tempDir, 'nested', 'deep', 'clawlens.db');
    ensureDir(dbPath);

    const fs = await import('node:fs');
    expect(fs.existsSync(join(tempDir, 'nested', 'deep'))).toBe(true);
  });

  it('should not throw if directory already exists', () => {
    const dbPath = join(tempDir, 'existing', 'clawlens.db');
    ensureDir(dbPath);
    expect(() => ensureDir(dbPath)).not.toThrow();
  });
});

describe('Legacy Interface', () => {
  it('should support resolveConfig alias', () => {
    const config = resolveConfig({ retentionDays: 60 });
    expect(config.retentionDays).toBe(60);
    expect(config.enabled).toBe(DEFAULT_CONFIG.enabled);
  });

  it('should validate in resolveConfig', () => {
    expect(() => resolveConfig({ retentionDays: -10 })).toThrow(ConfigValidationError);
  });
});

describe('Default Configuration', () => {
  it('should have sensible defaults', () => {
    expect(DEFAULT_CONFIG.enabled).toBe(true);
    expect(DEFAULT_CONFIG.retentionDays).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.backfillOnStart).toBe(true);
    expect(DEFAULT_CONFIG.dbPath).toContain('.openclaw');
    expect(DEFAULT_CONFIG.excludeAgents).toEqual([]);
    expect(DEFAULT_CONFIG.excludeChannels).toEqual([]);
  });

  it('should have valid default configuration', () => {
    expect(() => validateConfig(DEFAULT_CONFIG)).not.toThrow();
  });
});
