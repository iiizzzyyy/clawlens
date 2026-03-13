/**
 * Build Pipeline Tests
 *
 * Verifies that the build process produces correct outputs
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const ROOT_DIR = join(__dirname, '..');
const PLUGIN_DIR = join(ROOT_DIR, 'packages', 'plugin');
const UI_DIR = join(ROOT_DIR, 'packages', 'ui');
const PLUGIN_DIST = join(PLUGIN_DIR, 'dist');
const UI_DIST = join(UI_DIR, 'dist');

// =============================================================================
// Build Verification
// =============================================================================

describe('Build Pipeline', () => {
  beforeAll(() => {
    // Ensure builds are fresh
    console.log('Running builds...');
    try {
      execSync('pnpm run build', { cwd: UI_DIR, stdio: 'inherit' });
      execSync('pnpm run build', { cwd: PLUGIN_DIR, stdio: 'inherit' });
    } catch (error) {
      console.error('Build failed:', error);
      throw error;
    }
  }, 120000); // Allow 2 minutes for builds

  describe('UI Build', () => {
    it('should create dist directory', () => {
      expect(existsSync(UI_DIST)).toBe(true);
    });

    it('should generate index.html', () => {
      const indexPath = join(UI_DIST, 'index.html');
      expect(existsSync(indexPath)).toBe(true);

      const stats = statSync(indexPath);
      expect(stats.size).toBeGreaterThan(0);
    });

    it('should generate JavaScript assets', () => {
      const files = readdirSync(join(UI_DIST, 'assets'));
      const jsFiles = files.filter((f) => f.endsWith('.js'));
      expect(jsFiles.length).toBeGreaterThan(0);
    });

    it('should generate CSS assets', () => {
      const files = readdirSync(join(UI_DIST, 'assets'));
      const cssFiles = files.filter((f) => f.endsWith('.css'));
      expect(cssFiles.length).toBeGreaterThan(0);
    });

    it('should have reasonable bundle size', () => {
      const assetsDir = join(UI_DIST, 'assets');
      const files = readdirSync(assetsDir);

      let totalSize = 0;
      for (const file of files) {
        const stats = statSync(join(assetsDir, file));
        totalSize += stats.size;
      }

      // Warn if bundle is unreasonably large (> 5MB)
      const MAX_SIZE = 5 * 1024 * 1024; // 5MB
      expect(totalSize).toBeLessThan(MAX_SIZE);
    });
  });

  describe('Plugin Build', () => {
    it('should create dist directory', () => {
      expect(existsSync(PLUGIN_DIST)).toBe(true);
    });

    it('should generate index.js entry point', () => {
      const indexPath = join(PLUGIN_DIST, 'index.js');
      expect(existsSync(indexPath)).toBe(true);

      const stats = statSync(indexPath);
      expect(stats.size).toBeGreaterThan(0);
    });

    it('should generate TypeScript declarations', () => {
      const dtsPath = join(PLUGIN_DIST, 'index.d.ts');
      expect(existsSync(dtsPath)).toBe(true);
    });

    it('should include fixtures directory', () => {
      const fixturesPath = join(PLUGIN_DIST, 'fixtures');
      expect(existsSync(fixturesPath)).toBe(true);

      const demoPath = join(fixturesPath, 'demo');
      expect(existsSync(demoPath)).toBe(true);
    });

    it('should have demo session files', () => {
      const demoPath = join(PLUGIN_DIST, 'fixtures', 'demo');
      if (existsSync(demoPath)) {
        const files = readdirSync(demoPath);
        const jsonlFiles = files.filter((f) => f.endsWith('.jsonl'));
        expect(jsonlFiles.length).toBeGreaterThan(0);
      }
    });

    it('should not include dev dependencies in bundle', () => {
      const indexPath = join(PLUGIN_DIST, 'index.js');
      const content = require('fs').readFileSync(indexPath, 'utf-8');

      // Check that vitest is not bundled
      expect(content).not.toContain('vitest');
      // Check that test files are not bundled
      expect(content).not.toContain('.test.ts');
    });

    it('should be ES module format', () => {
      const packagePath = join(PLUGIN_DIR, 'package.json');
      const pkg = JSON.parse(require('fs').readFileSync(packagePath, 'utf-8'));
      expect(pkg.type).toBe('module');

      const indexPath = join(PLUGIN_DIST, 'index.js');
      const content = require('fs').readFileSync(indexPath, 'utf-8');

      // Should use ES module syntax
      expect(content).toMatch(/export|import/);
    });
  });

  describe('Package Metadata', () => {
    it('should have correct version in plugin package.json', () => {
      const packagePath = join(PLUGIN_DIR, 'package.json');
      const pkg = JSON.parse(require('fs').readFileSync(packagePath, 'utf-8'));

      expect(pkg.name).toBe('@clawlens/plugin');
      expect(pkg.version).toMatch(/^\d+\.\d+\.\d+/);
      expect(pkg.main).toBe('dist/index.js');
      expect(pkg.types).toBe('dist/index.d.ts');
    });

    it('should have correct version in UI package.json', () => {
      const packagePath = join(UI_DIR, 'package.json');
      const pkg = JSON.parse(require('fs').readFileSync(packagePath, 'utf-8'));

      expect(pkg.name).toBe('@clawlens/ui');
      expect(pkg.version).toMatch(/^\d+\.\d+\.\d+/);
    });

    it('should have OpenClaw plugin metadata', () => {
      const packagePath = join(PLUGIN_DIR, 'package.json');
      const pkg = JSON.parse(require('fs').readFileSync(packagePath, 'utf-8'));

      expect(pkg.openclaw).toBeDefined();
      expect(pkg.openclaw.extensions).toBeDefined();
      expect(Array.isArray(pkg.openclaw.extensions)).toBe(true);
    });
  });

  describe('File Structure', () => {
    it('should only include necessary files in plugin dist', () => {
      const files = readdirSync(PLUGIN_DIST);

      // Should have core files
      expect(files).toContain('index.js');
      expect(files).toContain('index.d.ts');

      // Should NOT have test files
      expect(files.some((f) => f.includes('.test.'))).toBe(false);

      // Should NOT have source maps in production (optional)
      // expect(files.some(f => f.endsWith('.map'))).toBe(false);
    });

    it('should have proper directory structure', () => {
      // Plugin dist structure
      expect(existsSync(join(PLUGIN_DIST, 'fixtures', 'demo'))).toBe(true);

      // UI dist structure
      expect(existsSync(join(UI_DIST, 'assets'))).toBe(true);
      expect(existsSync(join(UI_DIST, 'index.html'))).toBe(true);
    });
  });

  describe('Build Reproducibility', () => {
    it('should produce consistent builds', () => {
      // Get initial file list
      const files1 = readdirSync(PLUGIN_DIST);

      // Rebuild
      execSync('pnpm run build', { cwd: PLUGIN_DIR, stdio: 'pipe' });

      // Get file list after rebuild
      const files2 = readdirSync(PLUGIN_DIST);

      // Should have same files
      expect(files1.sort()).toEqual(files2.sort());
    });
  });
});
