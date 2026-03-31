/**
 * Memory file scanner and snapshot logic
 *
 * Scans the agent workspace for .md files, takes periodic snapshots,
 * and provides diff computation between snapshots.
 */

import { readdirSync, readFileSync, lstatSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import type Database from 'better-sqlite3';

/**
 * Metadata about a discovered workspace file
 */
export interface WorkspaceFile {
  path: string;
  name: string;
  size: number;
  modifiedAt: number;
}

/**
 * A stored snapshot record
 */
export interface MemorySnapshot {
  id: number;
  path: string;
  contentHash: string;
  capturedAt: number;
}

/**
 * Full snapshot with content
 */
export interface MemorySnapshotFull extends MemorySnapshot {
  content: string;
}

/**
 * Resolve the workspace root path, expanding ~ to home directory
 */
export function resolveWorkspaceRoot(configuredPath?: string): string {
  const raw = configuredPath || '~/.openclaw/';
  if (raw.startsWith('~/')) {
    return join(homedir(), raw.slice(2));
  }
  if (raw.startsWith('~')) {
    return join(homedir(), raw.slice(1));
  }
  return raw;
}

/**
 * Recursively scan a directory for .md files
 */
/**
 * Maximum files to process per scan (prevents choking on large workspaces)
 */
const MAX_SCAN_FILES = 500;

/**
 * Maximum file size to snapshot (skip very large files)
 */
const MAX_FILE_SIZE = 512 * 1024; // 512 KB

/**
 * Directories to skip during scanning (OpenClaw internals)
 */
const SKIP_DIRS = new Set(['node_modules', 'qmd', 'dist', 'build', '.git']);

export function scanMarkdownFiles(rootDir: string): WorkspaceFile[] {
  const files: WorkspaceFile[] = [];

  function walk(dir: string): void {
    if (files.length >= MAX_SCAN_FILES) return;

    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      // Directory doesn't exist or not readable — skip gracefully
      return;
    }

    for (const entry of entries) {
      if (files.length >= MAX_SCAN_FILES) return;

      // Skip hidden directories, node_modules, and OpenClaw internals
      if (entry.startsWith('.') || SKIP_DIRS.has(entry)) continue;

      const fullPath = join(dir, entry);
      let stat;
      try {
        stat = lstatSync(fullPath);
      } catch {
        continue; // Skip files we can't stat
      }

      // Skip symlinks to avoid circular references
      if (stat.isSymbolicLink()) continue;

      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (stat.isFile() && entry.endsWith('.md') && stat.size <= MAX_FILE_SIZE) {
        files.push({
          path: relative(rootDir, fullPath),
          name: entry,
          size: stat.size,
          modifiedAt: Math.floor(stat.mtimeMs),
        });
      }
    }
  }

  walk(rootDir);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Compute SHA-256 hash of content
 */
export function contentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Read a file safely, returning null if it cannot be read
 */
export function readFileSafe(absolutePath: string): string | null {
  try {
    return readFileSync(absolutePath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Validate that a relative path does not escape the root directory.
 * Prevents path traversal attacks.
 */
export function isPathSafe(relativePath: string): boolean {
  // Block absolute paths, .., and other traversal patterns
  if (relativePath.startsWith('/') || relativePath.startsWith('\\')) return false;
  const segments = relativePath.split(/[/\\]/);
  for (const seg of segments) {
    if (seg === '..') return false;
  }
  return true;
}

/**
 * Take snapshots of all changed workspace files.
 * Only stores a new snapshot if the content hash differs from the latest.
 */
export function captureSnapshots(
  db: Database.Database,
  workspaceRoot: string,
  logger: { info(msg: string, ...args: unknown[]): void }
): number {
  const files = scanMarkdownFiles(workspaceRoot);
  let captured = 0;

  const getLatest = db.prepare(
    'SELECT content_hash FROM memory_snapshots WHERE path = ? ORDER BY captured_at DESC LIMIT 1'
  );
  const insert = db.prepare(
    'INSERT INTO memory_snapshots (path, content_hash, content, captured_at) VALUES (?, ?, ?, ?)'
  );

  const now = Date.now();

  for (const file of files) {
    try {
      const absolutePath = join(workspaceRoot, file.path);
      const content = readFileSafe(absolutePath);
      if (content === null) continue;

      const hash = contentHash(content);
      const latest = getLatest.get(file.path) as { content_hash: string } | undefined;

      if (!latest || latest.content_hash !== hash) {
        insert.run(file.path, hash, content, now);
        captured++;
      }
    } catch {
      // Skip files that fail to process (permissions, encoding, etc.)
      continue;
    }
  }

  if (captured > 0) {
    logger.info(`[clawlens] Memory scanner: captured ${captured} snapshot(s)`);
  }

  return captured;
}

/**
 * Get snapshot history for a file (metadata only, no content)
 */
export function getSnapshotHistory(
  db: Database.Database,
  path: string
): MemorySnapshot[] {
  const rows = db
    .prepare(
      'SELECT id, path, content_hash, captured_at FROM memory_snapshots WHERE path = ? ORDER BY captured_at DESC'
    )
    .all(path) as Array<{ id: number; path: string; content_hash: string; captured_at: number }>;

  return rows.map((r) => ({
    id: r.id,
    path: r.path,
    contentHash: r.content_hash,
    capturedAt: r.captured_at,
  }));
}

/**
 * Get a snapshot by id (with content)
 */
export function getSnapshot(
  db: Database.Database,
  id: number
): MemorySnapshotFull | null {
  const row = db
    .prepare('SELECT id, path, content_hash, content, captured_at FROM memory_snapshots WHERE id = ?')
    .get(id) as
    | { id: number; path: string; content_hash: string; content: string; captured_at: number }
    | undefined;

  if (!row) return null;

  return {
    id: row.id,
    path: row.path,
    contentHash: row.content_hash,
    content: row.content,
    capturedAt: row.captured_at,
  };
}

/**
 * Get snapshot content closest to (or at) a given timestamp for a path
 */
export function getSnapshotAtTime(
  db: Database.Database,
  path: string,
  timestamp: number
): MemorySnapshotFull | null {
  const row = db
    .prepare(
      'SELECT id, path, content_hash, content, captured_at FROM memory_snapshots WHERE path = ? AND captured_at <= ? ORDER BY captured_at DESC LIMIT 1'
    )
    .get(path, timestamp) as
    | { id: number; path: string; content_hash: string; content: string; captured_at: number }
    | undefined;

  if (!row) return null;

  return {
    id: row.id,
    path: row.path,
    contentHash: row.content_hash,
    content: row.content,
    capturedAt: row.captured_at,
  };
}

/**
 * Simple line-by-line diff producing a unified-diff-style string.
 * Shows additions (+) and deletions (-) without full Myers algorithm.
 */
export function computeDiff(oldContent: string, newContent: string): string {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  const result: string[] = [];

  // Use a simple LCS-based approach for better diffs
  const lcs = computeLCS(oldLines, newLines);

  let oldIdx = 0;
  let newIdx = 0;

  for (const [oldMatch, newMatch] of lcs) {
    // Lines removed before this match
    while (oldIdx < oldMatch) {
      result.push(`-${oldLines[oldIdx]}`);
      oldIdx++;
    }
    // Lines added before this match
    while (newIdx < newMatch) {
      result.push(`+${newLines[newIdx]}`);
      newIdx++;
    }
    // Matching line
    result.push(` ${oldLines[oldIdx]}`);
    oldIdx++;
    newIdx++;
  }

  // Remaining lines
  while (oldIdx < oldLines.length) {
    result.push(`-${oldLines[oldIdx]}`);
    oldIdx++;
  }
  while (newIdx < newLines.length) {
    result.push(`+${newLines[newIdx]}`);
    newIdx++;
  }

  return result.join('\n');
}

/**
 * Compute LCS (Longest Common Subsequence) index pairs.
 * Returns pairs of [oldIndex, newIndex] for matching lines.
 */
function computeLCS(a: string[], b: string[]): Array<[number, number]> {
  const m = a.length;
  const n = b.length;

  // For very large files, fall back to simple line-by-line comparison
  if (m * n > 1_000_000) {
    return simpleLCS(a, b);
  }

  // Standard DP LCS
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find matching pairs
  const pairs: Array<[number, number]> = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      pairs.push([i - 1, j - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return pairs.reverse();
}

/**
 * Simple fallback LCS for large files — matches lines greedily
 */
function simpleLCS(a: string[], b: string[]): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  const bMap = new Map<string, number[]>();

  for (let j = 0; j < b.length; j++) {
    const existing = bMap.get(b[j]);
    if (existing) {
      existing.push(j);
    } else {
      bMap.set(b[j], [j]);
    }
  }

  let lastJ = -1;
  for (let i = 0; i < a.length; i++) {
    const positions = bMap.get(a[i]);
    if (!positions) continue;
    // Find first position after lastJ
    for (const j of positions) {
      if (j > lastJ) {
        pairs.push([i, j]);
        lastJ = j;
        break;
      }
    }
  }

  return pairs;
}
