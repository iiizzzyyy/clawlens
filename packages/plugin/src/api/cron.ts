/**
 * Cron API handlers — scheduled jobs dashboard endpoints
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type Database from 'better-sqlite3';
import { readCronJobs } from '../cron/cron-reader.js';
import {
  getCronSummary,
  getJobsWithStats,
  getJobRuns,
} from '../cron/cron-queries.js';

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

export function handleCronJobs(
  _req: IncomingMessage,
  res: ServerResponse,
  db: Database.Database,
  logger: Logger
): void {
  try {
    const jobs = readCronJobs(logger);
    const jobsWithStats = getJobsWithStats(db, jobs);
    sendJson(res, { data: jobsWithStats });
  } catch (error) {
    logger.error('[clawlens] Error in cron jobs:', error);
    sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
}

export function handleCronJobRuns(
  req: IncomingMessage,
  res: ServerResponse,
  db: Database.Database,
  logger: Logger
): void {
  try {
    const path = getUrlPath(req.url);
    // Path: /clawlens/api/cron/jobs/<id>/runs
    const match = path.match(/\/clawlens\/api\/cron\/jobs\/([^/]+)\/runs/);
    if (!match) {
      sendError(res, 'BAD_REQUEST', 'Invalid job ID', 400);
      return;
    }

    const jobId = decodeURIComponent(match[1]);
    const params = getQueryParams(req.url);
    const limit = Math.min(parseInt(params.get('limit') || '20', 10), 100);
    const offset = parseInt(params.get('offset') || '0', 10);

    const runs = getJobRuns(db, jobId, limit, offset);
    sendJson(res, { data: runs });
  } catch (error) {
    logger.error('[clawlens] Error in cron job runs:', error);
    sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
}

export function handleCronSummary(
  _req: IncomingMessage,
  res: ServerResponse,
  db: Database.Database,
  logger: Logger
): void {
  try {
    const jobs = readCronJobs(logger);
    const summary = getCronSummary(db, jobs);
    sendJson(res, { data: summary });
  } catch (error) {
    logger.error('[clawlens] Error in cron summary:', error);
    sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
}
