/**
 * Log file discovery, parsing, and tailing for real-time log streaming.
 *
 * Scans ~/.openclaw/logs/ for .log files, parses common log formats,
 * and provides polling-based tailing for SSE streaming.
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedLogLine {
  timestamp: string;
  level: 'error' | 'warn' | 'info' | 'debug';
  agent: string;
  message: string;
}

export interface LogTailHandle {
  /** Stop polling and clean up */
  stop(): void;
}

export interface LogReaderOptions {
  logDir?: string;
  pollIntervalMs?: number;
}

// ---------------------------------------------------------------------------
// Log line parsing
// ---------------------------------------------------------------------------

/**
 * Pattern: [TIMESTAMP] [LEVEL] [AGENT] message
 * Example: [2026-03-30T10:15:42.123Z] [ERROR] [weatherbot] Something failed
 */
const BRACKETED_RE =
  /^\[([^\]]+)\]\s*\[([^\]]+)\]\s*\[([^\]]+)\]\s*(.*)$/;

/**
 * Pattern: TIMESTAMP LEVEL message
 * Example: 2026-03-30T10:15:42.123Z INFO Something happened
 */
const SIMPLE_RE =
  /^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[.\d]*Z?)\s+(ERROR|WARN|INFO|DEBUG|error|warn|info|debug)\s+(.*)$/;

/**
 * Pattern: TIMESTAMP LEVEL [AGENT] message
 * Example: 2026-03-30T10:15:42.123Z INFO [weatherbot] Something happened
 */
const SIMPLE_AGENT_RE =
  /^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[.\d]*Z?)\s+(ERROR|WARN|INFO|DEBUG|error|warn|info|debug)\s+\[([^\]]+)\]\s*(.*)$/;

function normalizeLevel(raw: string): ParsedLogLine['level'] {
  const lower = raw.toLowerCase();
  if (lower === 'error' || lower === 'err') return 'error';
  if (lower === 'warn' || lower === 'warning') return 'warn';
  if (lower === 'debug' || lower === 'trace') return 'debug';
  return 'info';
}

export function parseLogLine(line: string): ParsedLogLine | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // Try bracketed format first: [TS] [LEVEL] [AGENT] msg
  let match = BRACKETED_RE.exec(trimmed);
  if (match) {
    return {
      timestamp: match[1],
      level: normalizeLevel(match[2]),
      agent: match[3],
      message: match[4],
    };
  }

  // Try simple format with agent: TS LEVEL [AGENT] msg
  match = SIMPLE_AGENT_RE.exec(trimmed);
  if (match) {
    return {
      timestamp: match[1],
      level: normalizeLevel(match[2]),
      agent: match[3],
      message: match[4],
    };
  }

  // Try simple format: TS LEVEL msg
  match = SIMPLE_RE.exec(trimmed);
  if (match) {
    return {
      timestamp: match[1],
      level: normalizeLevel(match[2]),
      agent: '',
      message: match[3],
    };
  }

  // Unparseable — treat as info with no timestamp
  return {
    timestamp: new Date().toISOString(),
    level: 'info',
    agent: '',
    message: trimmed,
  };
}

// ---------------------------------------------------------------------------
// Log file discovery
// ---------------------------------------------------------------------------

function defaultLogDir(): string {
  return join(homedir(), '.openclaw', 'logs');
}

/**
 * Discover .log files in the given directory (non-recursive).
 */
export function discoverLogFiles(logDir: string): string[] {
  if (!existsSync(logDir)) return [];

  try {
    const entries = readdirSync(logDir);
    return entries
      .filter((e) => e.endsWith('.log'))
      .map((e) => join(logDir, e))
      .filter((p) => {
        try {
          return statSync(p).isFile();
        } catch {
          return false;
        }
      });
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Read last N lines from all discovered log files
// ---------------------------------------------------------------------------

/**
 * Read the last `count` lines across all log files, sorted by timestamp.
 */
export function readRecentLines(
  logDir: string,
  count: number
): ParsedLogLine[] {
  const files = discoverLogFiles(logDir);
  if (files.length === 0) return [];

  const allLines: ParsedLogLine[] = [];

  for (const filePath of files) {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      // Take the last `count` raw lines from each file to limit work
      const tail = lines.slice(-count);
      for (const raw of tail) {
        const parsed = parseLogLine(raw);
        if (parsed) allLines.push(parsed);
      }
    } catch {
      // Skip unreadable files
    }
  }

  // Sort by timestamp then take last `count`
  allLines.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return allLines.slice(-count);
}

// ---------------------------------------------------------------------------
// File position tracker for tailing
// ---------------------------------------------------------------------------

/**
 * Read new lines from all log files since the last known positions.
 */
function readNewLines(
  logDir: string,
  positions: Map<string, number>
): { lines: ParsedLogLine[]; positions: Map<string, number> } {
  const files = discoverLogFiles(logDir);
  const newLines: ParsedLogLine[] = [];
  const newPositions = new Map(positions);

  for (const filePath of files) {
    try {
      const stat = statSync(filePath);
      const prevOffset = positions.get(filePath) ?? 0;

      // File was truncated/rotated — reset
      if (stat.size < prevOffset) {
        newPositions.set(filePath, 0);
      }

      const currentOffset = newPositions.get(filePath) ?? 0;
      if (stat.size <= currentOffset) continue;

      // Read from offset to end
      const content = readFileSync(filePath, 'utf-8');
      const newContent = content.slice(currentOffset);
      const lines = newContent.split('\n');

      for (const raw of lines) {
        const parsed = parseLogLine(raw);
        if (parsed) newLines.push(parsed);
      }

      newPositions.set(filePath, stat.size);
    } catch {
      // Skip
    }
  }

  // Also pick up newly discovered files
  for (const filePath of files) {
    if (!newPositions.has(filePath)) {
      newPositions.set(filePath, 0);
    }
  }

  return { lines: newLines, positions: newPositions };
}

// ---------------------------------------------------------------------------
// Log tailer — polling-based
// ---------------------------------------------------------------------------

export interface LogTailCallbacks {
  onLines(lines: ParsedLogLine[]): void;
  onError?(error: unknown): void;
}

/**
 * Start polling for new log lines. Returns a handle to stop polling.
 */
export function startTailing(
  callbacks: LogTailCallbacks,
  options?: LogReaderOptions
): LogTailHandle {
  const logDir = options?.logDir ?? defaultLogDir();
  const pollMs = options?.pollIntervalMs ?? 2000;

  // Initialize positions to end-of-file so we only stream *new* lines
  let positions = new Map<string, number>();
  const files = discoverLogFiles(logDir);
  for (const filePath of files) {
    try {
      const stat = statSync(filePath);
      positions.set(filePath, stat.size);
    } catch {
      // ignore
    }
  }

  const interval = setInterval(() => {
    try {
      const result = readNewLines(logDir, positions);
      positions = result.positions;
      if (result.lines.length > 0) {
        callbacks.onLines(result.lines);
      }
    } catch (error) {
      callbacks.onError?.(error);
    }
  }, pollMs);

  return {
    stop() {
      clearInterval(interval);
    },
  };
}

// ---------------------------------------------------------------------------
// Filtering helpers
// ---------------------------------------------------------------------------

export function filterLines(
  lines: ParsedLogLine[],
  filters: { level?: string; agent?: string; search?: string }
): ParsedLogLine[] {
  return lines.filter((line) => {
    if (filters.level && line.level !== filters.level.toLowerCase()) {
      return false;
    }
    if (filters.agent && !line.agent.toLowerCase().includes(filters.agent.toLowerCase())) {
      return false;
    }
    if (filters.search && !line.message.toLowerCase().includes(filters.search.toLowerCase())) {
      return false;
    }
    return true;
  });
}

/**
 * Get the default log directory path.
 */
export function getDefaultLogDir(): string {
  return defaultLogDir();
}
