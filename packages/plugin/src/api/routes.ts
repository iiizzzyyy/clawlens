/**
 * HTTP route registration for ClawLens API and UI
 *
 * Registers all API endpoints and static file serving for the UI.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import type Database from 'better-sqlite3';
import type { SpanReader } from '../db/reader.js';
import type { FlowBus } from '../events/flow-bus.js';
import { handleSessionsList, handleSessionReplay, handleSessionSummary } from './sessions.js';
import { handleSessionExport } from './export.js';
import { handleAnalytics, ANALYTICS_QUERY_TYPES } from './analytics.js';
import { handleTopology } from './topology.js';
import { handleBots } from './bots.js';
import { handleCronJobs, handleCronJobRuns, handleCronSummary } from './cron.js';
import { handleMemoryFiles, handleMemoryFileRead, handleMemoryHistory, handleMemoryDiff } from './memory.js';
import type { OpenClawConfigReader } from '../config/openclaw-config.js';
import {
  readRecentLines,
  startTailing,
  filterLines,
  getDefaultLogDir,
  type ParsedLogLine,
} from '../logs/log-reader.js';

/**
 * HTTP route configuration (matches OpenClaw plugin SDK)
 */
export interface HttpRouteConfig {
  path: string;
  auth: 'gateway' | 'plugin';
  match?: 'exact' | 'prefix';
  replaceExisting?: boolean;
  // Use specific types internally but cast to satisfy plugin API
  handler: (req: IncomingMessage, res: ServerResponse) => Promise<boolean>;
}

/**
 * Plugin API route config (with unknown types for compatibility)
 */
export interface PluginRouteConfig {
  path: string;
  auth: 'gateway' | 'plugin';
  match?: 'exact' | 'prefix';
  replaceExisting?: boolean;
  handler: (req: unknown, res: unknown) => Promise<boolean>;
}

/**
 * Logger interface
 */
export interface Logger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

/**
 * MIME types for static files
 */
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

/**
 * Send JSON response with consistent envelope
 */
function sendJson(res: ServerResponse, data: unknown, statusCode = 200): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

/**
 * Send error response
 */
function sendError(
  res: ServerResponse,
  code: string,
  message: string,
  statusCode: number
): void {
  sendJson(res, { data: null, error: { code, message } }, statusCode);
}

/**
 * Get URL path without query string
 */
function getUrlPath(url: string | undefined): string {
  if (!url) return '';
  const queryIndex = url.indexOf('?');
  return queryIndex === -1 ? url : url.slice(0, queryIndex);
}

/**
 * Create route handlers with access to SpanReader
 */
export function createRouteHandlers(
  reader: SpanReader,
  uiDistPath: string,
  logger: Logger,
  configReader?: OpenClawConfigReader,
  db?: Database.Database,
  flowBus?: FlowBus
): HttpRouteConfig[] {
  return [
    // API: Flow SSE stream
    ...(flowBus
      ? [
          {
            path: '/clawlens/api/flow/stream',
            auth: 'gateway' as const,
            match: 'exact' as const,
            handler: async (req: IncomingMessage, res: ServerResponse) => {
              try {
                // Set SSE headers
                res.writeHead(200, {
                  'Content-Type': 'text/event-stream',
                  'Cache-Control': 'no-cache',
                  'Connection': 'keep-alive',
                  'X-Accel-Buffering': 'no',
                });

                // Send recent events as initial state
                const recentEvents = flowBus.getRecent(50);
                for (const event of recentEvents) {
                  res.write(`data: ${JSON.stringify(event)}\n\n`);
                }

                // Subscribe to new events
                const unsubscribe = flowBus.subscribe((event) => {
                  try {
                    res.write(`data: ${JSON.stringify(event)}\n\n`);
                  } catch {
                    // Client disconnected, cleanup will happen via 'close'
                  }
                });

                // Keep-alive ping every 30s
                const keepAlive = setInterval(() => {
                  try {
                    res.write(': keepalive\n\n');
                  } catch {
                    // Client disconnected
                  }
                }, 30_000);

                // Cleanup on client disconnect
                req.on('close', () => {
                  unsubscribe();
                  clearInterval(keepAlive);
                });

                // SSE connections stay open — don't end the response
                return true;
              } catch (error) {
                logger.error('[clawlens] Error in flow stream:', error);
                sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
                return true;
              }
            },
          },
        ]
      : []),

    // API: Log streaming (SSE)
    {
      path: '/clawlens/api/logs/stream',
      auth: 'gateway' as const,
      match: 'prefix' as const,
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        try {
          // Parse query params for filters
          const queryStr = req.url?.split('?')[1] ?? '';
          const params = new URLSearchParams(queryStr);
          const levelFilter = params.get('level') ?? undefined;
          const agentFilter = params.get('agent') ?? undefined;
          const searchFilter = params.get('search') ?? undefined;
          const filters = { level: levelFilter, agent: agentFilter, search: searchFilter };

          const logDir = getDefaultLogDir();

          // Set SSE headers
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
          });

          // Send initial state: last 200 lines
          const initial = filterLines(readRecentLines(logDir, 200), filters);
          for (const line of initial) {
            res.write(`data: ${JSON.stringify(line)}\n\n`);
          }

          // If log dir doesn't exist, inform client
          if (!existsSync(logDir)) {
            res.write(`: no log directory found at ${logDir}\n\n`);
          }

          // Start tailing for new lines
          const tail = startTailing(
            {
              onLines(lines: ParsedLogLine[]) {
                const filtered = filterLines(lines, filters);
                for (const line of filtered) {
                  try {
                    res.write(`data: ${JSON.stringify(line)}\n\n`);
                  } catch {
                    // Client disconnected
                  }
                }
              },
              onError(error: unknown) {
                logger.error('[clawlens] Log tail error:', error);
              },
            },
            { logDir, pollIntervalMs: 2000 }
          );

          // Keep-alive ping every 30s
          const keepAlive = setInterval(() => {
            try {
              res.write(': keepalive\n\n');
            } catch {
              // Client disconnected
            }
          }, 30_000);

          // Cleanup on client disconnect
          req.on('close', () => {
            tail.stop();
            clearInterval(keepAlive);
          });

          return true;
        } catch (error) {
          logger.error('[clawlens] Error in log stream:', error);
          sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
          return true;
        }
      },
    },

    // API: Bots overview
    ...(configReader
      ? [
          {
            path: '/clawlens/api/bots',
            auth: 'gateway' as const,
            match: 'exact' as const,
            handler: async (req: IncomingMessage, res: ServerResponse) => {
              try {
                const result = handleBots(req.url || '', reader, configReader);
                if (result.error) {
                  sendJson(res, result, 400);
                } else {
                  sendJson(res, result);
                }
                return true;
              } catch (error) {
                logger.error('[clawlens] Error in bots:', error);
                sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
                return true;
              }
            },
          },
        ]
      : []),

    // API: List sessions
    {
      path: '/clawlens/api/sessions',
      auth: 'gateway',
      match: 'exact',
      handler: async (req, res) => {
        try {
          const result = handleSessionsList(req.url || '', reader);
          if (result.error) {
            sendJson(res, result, 400);
          } else {
            sendJson(res, result);
          }
          return true;
        } catch (error) {
          logger.error('[clawlens] Error in sessions list:', error);
          sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
          return true;
        }
      },
    },

    // API: Session replay
    {
      path: '/clawlens/api/sessions/',
      auth: 'gateway',
      match: 'prefix',
      handler: async (req, res) => {
        try {
          const path = getUrlPath(req.url);

          // Route to replay, summary, or export based on path
          if (path.endsWith('/replay')) {
            const result = handleSessionReplay(req.url || '', reader);
            if (result.error) {
              const statusCode = result.error.code === 'NOT_FOUND' ? 404 : 400;
              sendJson(res, result, statusCode);
            } else {
              sendJson(res, result);
            }
          } else if (path.endsWith('/summary')) {
            const result = handleSessionSummary(req.url || '', reader);
            if (result.error) {
              const statusCode = result.error.code === 'NOT_FOUND' ? 404 : 400;
              sendJson(res, result, statusCode);
            } else {
              sendJson(res, result);
            }
          } else if (path.endsWith('/export')) {
            handleSessionExport(req.url || '', res, reader);
          } else {
            sendError(res, 'NOT_FOUND', 'Endpoint not found', 404);
          }
          return true;
        } catch (error) {
          logger.error('[clawlens] Error in session endpoint:', error);
          sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
          return true;
        }
      },
    },

    // API: Analytics queries
    {
      path: '/clawlens/api/analytics',
      auth: 'gateway',
      match: 'prefix',
      handler: async (req, res) => {
        try {
          const path = getUrlPath(req.url);

          // List available query types at /analytics
          if (path === '/clawlens/api/analytics' || path === '/clawlens/api/analytics/') {
            sendJson(res, {
              data: {
                availableQueries: ANALYTICS_QUERY_TYPES,
              },
            });
            return true;
          }

          const result = handleAnalytics(req.url || '', reader);
          if (result.error) {
            sendJson(res, result, 400);
          } else {
            sendJson(res, result);
          }
          return true;
        } catch (error) {
          logger.error('[clawlens] Error in analytics:', error);
          sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
          return true;
        }
      },
    },

    // API: Agent topology
    {
      path: '/clawlens/api/topology',
      auth: 'gateway',
      match: 'exact',
      handler: async (req, res) => {
        try {
          const result = handleTopology(req.url || '', reader);
          if (result.error) {
            sendJson(res, result, 400);
          } else {
            sendJson(res, result);
          }
          return true;
        } catch (error) {
          logger.error('[clawlens] Error in topology:', error);
          sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
          return true;
        }
      },
    },

    // API: Memory browser (workspace files and snapshots)
    ...(db
      ? [
          {
            path: '/clawlens/api/memory/history',
            auth: 'gateway' as const,
            match: 'exact' as const,
            handler: async (req: IncomingMessage, res: ServerResponse) => {
              handleMemoryHistory(req, res, db, logger);
              return true;
            },
          },
          {
            path: '/clawlens/api/memory/diff',
            auth: 'gateway' as const,
            match: 'exact' as const,
            handler: async (req: IncomingMessage, res: ServerResponse) => {
              handleMemoryDiff(req, res, db, logger);
              return true;
            },
          },
          {
            path: '/clawlens/api/memory/files',
            auth: 'gateway' as const,
            match: 'prefix' as const,
            handler: async (req: IncomingMessage, res: ServerResponse) => {
              const path = getUrlPath(req.url);
              if (path === '/clawlens/api/memory/files' || path === '/clawlens/api/memory/files/') {
                handleMemoryFiles(req, res, db, logger);
              } else {
                handleMemoryFileRead(req, res, db, logger);
              }
              return true;
            },
          },
        ]
      : []),

    // API: Cron jobs (scheduled workflows)
    ...(db
      ? [
          {
            path: '/clawlens/api/cron/summary',
            auth: 'gateway' as const,
            match: 'exact' as const,
            handler: async (req: IncomingMessage, res: ServerResponse) => {
              handleCronSummary(req, res, db, logger);
              return true;
            },
          },
          {
            path: '/clawlens/api/cron/jobs',
            auth: 'gateway' as const,
            match: 'prefix' as const,
            handler: async (req: IncomingMessage, res: ServerResponse) => {
              const path = getUrlPath(req.url);
              if (path.endsWith('/runs')) {
                handleCronJobRuns(req, res, db, logger);
              } else if (
                path === '/clawlens/api/cron/jobs' ||
                path === '/clawlens/api/cron/jobs/'
              ) {
                handleCronJobs(req, res, db, logger);
              } else {
                sendError(res, 'NOT_FOUND', 'Endpoint not found', 404);
              }
              return true;
            },
          },
        ]
      : []),

    // UI: Serve static files and SPA fallback
    {
      path: '/clawlens',
      auth: 'gateway',
      match: 'prefix',
      handler: async (req, res) => {
        try {
          const path = getUrlPath(req.url);

          // Don't handle API routes
          if (path.startsWith('/clawlens/api/')) {
            return false;
          }

          // Get file path relative to /clawlens
          let relativePath = path.replace('/clawlens', '') || '/index.html';
          if (relativePath === '/') {
            relativePath = '/index.html';
          }

          const filePath = join(uiDistPath, relativePath);
          const ext = extname(filePath);

          // Try to serve the file
          if (existsSync(filePath) && ext) {
            const content = readFileSync(filePath);
            const mimeType = MIME_TYPES[ext] || 'application/octet-stream';
            res.setHeader('Content-Type', mimeType);
            res.end(content);
            return true;
          }

          // SPA fallback: serve index.html for non-file routes
          const indexPath = join(uiDistPath, 'index.html');
          if (existsSync(indexPath)) {
            const content = readFileSync(indexPath);
            res.setHeader('Content-Type', 'text/html');
            res.end(content);
            return true;
          }

          // Fallback: UI not built
          res.setHeader('Content-Type', 'text/html');
          res.end(`
            <!DOCTYPE html>
            <html>
              <head><title>ClawLens</title></head>
              <body>
                <h1>ClawLens</h1>
                <p>UI not found. Build the UI with <code>pnpm -r build</code> in packages/ui.</p>
                <h2>API Endpoints:</h2>
                <ul>
                  <li><a href="/clawlens/api/sessions">/clawlens/api/sessions</a> - List sessions</li>
                  <li><a href="/clawlens/api/analytics">/clawlens/api/analytics</a> - Analytics queries</li>
                  <li><a href="/clawlens/api/topology">/clawlens/api/topology</a> - Agent topology</li>
                </ul>
              </body>
            </html>
          `);
          return true;
        } catch (error) {
          logger.error('[clawlens] Error serving UI:', error);
          sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
          return true;
        }
      },
    },
  ];
}

/**
 * Register all ClawLens HTTP routes with OpenClaw plugin API
 */
export function registerRoutes(
  registerHttpRoute: (config: PluginRouteConfig) => void,
  reader: SpanReader,
  uiDistPath: string,
  logger: Logger,
  configReader?: OpenClawConfigReader,
  db?: Database.Database,
  flowBus?: FlowBus
): void {
  const routes = createRouteHandlers(reader, uiDistPath, logger, configReader, db, flowBus);

  for (const route of routes) {
    // Cast handler to satisfy plugin API signature
    const pluginRoute: PluginRouteConfig = {
      ...route,
      handler: route.handler as (req: unknown, res: unknown) => Promise<boolean>,
    };
    registerHttpRoute(pluginRoute);
  }

  logger.info(`[clawlens] Registered ${routes.length} HTTP routes`);
}
