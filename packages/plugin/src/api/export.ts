/**
 * Session export API handler
 *
 * Supports exporting session replay data as self-contained HTML or JSON.
 */

import type { ServerResponse } from 'node:http';
import type { SpanReader } from '../db/reader.js';
import { extractSessionId, parseQueryParams } from './sessions.js';
import { renderSessionHtml, type SpanNode } from '../export/html-renderer.js';

export type ExportFormat = 'html' | 'json';

/**
 * Handle GET /clawlens/api/sessions/:id/export?format=html|json
 *
 * Returns the session as a downloadable file.
 */
export function handleSessionExport(
  url: string,
  res: ServerResponse,
  reader: SpanReader
): boolean {
  const sessionId = extractSessionId(url);

  if (!sessionId) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ data: null, error: { code: 'MISSING_PARAM', message: 'Session ID is required' } }));
    return true;
  }

  const params = parseQueryParams(url);
  const format: ExportFormat = params.format === 'json' ? 'json' : 'html';

  const tree = reader.getSpanTree(sessionId);

  if (!tree) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ data: null, error: { code: 'NOT_FOUND', message: `Session ${sessionId} not found` } }));
    return true;
  }

  const safeAgentId = tree.agentId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `clawlens-${safeAgentId}-${sessionId.slice(0, 8)}`;

  if (format === 'json') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.json"`);
    res.end(JSON.stringify(tree, null, 2));
    return true;
  }

  // HTML export — cast to SpanNode since getSpanTree builds recursive children at runtime
  const html = renderSessionHtml(tree as SpanNode);
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.html"`);
  res.end(html);
  return true;
}
