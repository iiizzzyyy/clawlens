/**
 * Memory API handlers — workspace file browser and snapshot diff
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import { statSync } from 'node:fs';
import type Database from 'better-sqlite3';
import {
  resolveWorkspaceRoot,
  scanMarkdownFiles,
  readFileSafe,
  isPathSafe,
  getSnapshotHistory,
  getSnapshotAtTime,
  computeDiff,
} from '../memory/scanner.js';

interface Logger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

function sendJson(res: ServerResponse, data: unknown, statusCode = 200): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

function sendError(
  res: ServerResponse,
  code: string,
  message: string,
  statusCode: number
): void {
  sendJson(res, { data: null, error: { code, message } }, statusCode);
}

function getUrlPath(url: string | undefined): string {
  if (!url) return '';
  const queryIndex = url.indexOf('?');
  return queryIndex === -1 ? url : url.slice(0, queryIndex);
}

function getQueryParams(url: string | undefined): URLSearchParams {
  if (!url) return new URLSearchParams();
  const queryIndex = url.indexOf('?');
  return queryIndex === -1
    ? new URLSearchParams()
    : new URLSearchParams(url.slice(queryIndex + 1));
}

/**
 * GET /clawlens/api/memory/files — list workspace .md files
 */
export function handleMemoryFiles(
  _req: IncomingMessage,
  res: ServerResponse,
  _db: Database.Database,
  logger: Logger,
  workspaceRoot?: string
): void {
  try {
    const root = resolveWorkspaceRoot(workspaceRoot);
    const files = scanMarkdownFiles(root);
    sendJson(res, { data: files });
  } catch (error) {
    logger.error('[clawlens] Error listing memory files:', error);
    sendError(res, 'INTERNAL_ERROR', 'Failed to list workspace files', 500);
  }
}

/**
 * GET /clawlens/api/memory/files/:path — read file content
 * The :path segment is base64-encoded
 */
export function handleMemoryFileRead(
  req: IncomingMessage,
  res: ServerResponse,
  _db: Database.Database,
  logger: Logger,
  workspaceRoot?: string
): void {
  try {
    const urlPath = getUrlPath(req.url);
    const prefix = '/clawlens/api/memory/files/';
    const encodedPath = urlPath.slice(prefix.length);

    if (!encodedPath) {
      sendError(res, 'BAD_REQUEST', 'Missing file path', 400);
      return;
    }

    let relativePath: string;
    try {
      relativePath = Buffer.from(decodeURIComponent(encodedPath), 'base64').toString('utf-8');
    } catch {
      sendError(res, 'BAD_REQUEST', 'Invalid base64-encoded path', 400);
      return;
    }

    // Path traversal protection
    if (!isPathSafe(relativePath)) {
      sendError(res, 'BAD_REQUEST', 'Invalid file path', 400);
      return;
    }

    const root = resolveWorkspaceRoot(workspaceRoot);
    const absolutePath = join(root, relativePath);

    // Ensure the resolved path is still within the workspace root
    if (!absolutePath.startsWith(root)) {
      sendError(res, 'BAD_REQUEST', 'Path outside workspace', 400);
      return;
    }

    const content = readFileSafe(absolutePath);
    if (content === null) {
      sendError(res, 'NOT_FOUND', 'File not found', 404);
      return;
    }

    let modifiedAt = Date.now();
    try {
      modifiedAt = Math.floor(statSync(absolutePath).mtimeMs);
    } catch {
      // Use current time as fallback
    }

    sendJson(res, {
      data: {
        path: relativePath,
        content,
        modifiedAt,
      },
    });
  } catch (error) {
    logger.error('[clawlens] Error reading memory file:', error);
    sendError(res, 'INTERNAL_ERROR', 'Failed to read file', 500);
  }
}

/**
 * GET /clawlens/api/memory/history?path=... — snapshot history for a file
 */
export function handleMemoryHistory(
  req: IncomingMessage,
  res: ServerResponse,
  db: Database.Database,
  logger: Logger
): void {
  try {
    const params = getQueryParams(req.url);
    const path = params.get('path');

    if (!path) {
      sendError(res, 'BAD_REQUEST', 'Missing path query parameter', 400);
      return;
    }

    if (!isPathSafe(path)) {
      sendError(res, 'BAD_REQUEST', 'Invalid file path', 400);
      return;
    }

    const snapshots = getSnapshotHistory(db, path);
    sendJson(res, { data: snapshots });
  } catch (error) {
    logger.error('[clawlens] Error fetching memory history:', error);
    sendError(res, 'INTERNAL_ERROR', 'Failed to fetch history', 500);
  }
}

/**
 * GET /clawlens/api/memory/diff?path=...&from=...&to=... — diff between two snapshot timestamps
 */
export function handleMemoryDiff(
  req: IncomingMessage,
  res: ServerResponse,
  db: Database.Database,
  logger: Logger
): void {
  try {
    const params = getQueryParams(req.url);
    const path = params.get('path');
    const fromStr = params.get('from');
    const toStr = params.get('to');

    if (!path || !fromStr || !toStr) {
      sendError(res, 'BAD_REQUEST', 'Missing required query parameters: path, from, to', 400);
      return;
    }

    if (!isPathSafe(path)) {
      sendError(res, 'BAD_REQUEST', 'Invalid file path', 400);
      return;
    }

    const from = parseInt(fromStr, 10);
    const to = parseInt(toStr, 10);

    if (isNaN(from) || isNaN(to)) {
      sendError(res, 'BAD_REQUEST', 'from and to must be numeric timestamps', 400);
      return;
    }

    const fromSnapshot = getSnapshotAtTime(db, path, from);
    const toSnapshot = getSnapshotAtTime(db, path, to);

    const fromContent = fromSnapshot?.content ?? '';
    const toContent = toSnapshot?.content ?? '';

    const diff = computeDiff(fromContent, toContent);

    sendJson(res, {
      data: {
        path,
        from: fromSnapshot?.capturedAt ?? from,
        to: toSnapshot?.capturedAt ?? to,
        diff,
      },
    });
  } catch (error) {
    logger.error('[clawlens] Error computing memory diff:', error);
    sendError(res, 'INTERNAL_ERROR', 'Failed to compute diff', 500);
  }
}
