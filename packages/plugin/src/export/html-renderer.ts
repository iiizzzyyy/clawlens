/**
 * Renders a session SpanNode as a self-contained HTML document.
 *
 * The output is a complete HTML page with inline CSS and minimal JS,
 * viewable in any browser without a server.
 */

import type { Span } from '../db/types.js';

export type SpanNode = Span & { children: SpanNode[] };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDuration(ms: number | null): string {
  if (ms == null) return '-';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function formatCost(usd: number): string {
  if (usd === 0) return '$0';
  if (usd < 0.001) return `$${usd.toFixed(6)}`;
  return `$${usd.toFixed(4)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
}

function spanTypeLabel(type: string): string {
  switch (type) {
    case 'llm_call': return 'LLM Call';
    case 'tool_exec': return 'Tool';
    case 'memory_search': return 'Memory';
    case 'delegation': return 'Delegation';
    default: return type;
  }
}

function spanTypeColor(type: string): string {
  switch (type) {
    case 'llm_call': return '#60a5fa';       // blue-400
    case 'tool_exec': return '#a78bfa';      // purple-400
    case 'memory_search': return '#22d3ee';  // cyan-400
    case 'delegation': return '#fb923c';     // orange-400
    default: return '#94a3b8';               // slate-400
  }
}

function statusDot(status: string): string {
  const color =
    status === 'ok' ? '#4ade80' :
    status === 'error' ? '#f87171' :
    status === 'timeout' ? '#fbbf24' : '#94a3b8';
  return `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:6px"></span>`;
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

function renderChildSpan(span: SpanNode): string {
  const color = spanTypeColor(span.spanType);
  const isError = span.status === 'error';
  const border = isError ? 'border-left:3px solid #f87171' : `border-left:3px solid ${color}`;
  const name = span.name || spanTypeLabel(span.spanType);

  let details = '';
  if (span.model) details += `<span class="meta">${esc(span.model)}</span>`;
  if (span.durationMs) details += `<span class="meta">${formatDuration(span.durationMs)}</span>`;
  if (span.costUsd > 0) details += `<span class="meta">${formatCost(span.costUsd)}</span>`;
  if (span.tokensIn > 0 || span.tokensOut > 0)
    details += `<span class="meta">${formatTokens(span.tokensIn)}→${formatTokens(span.tokensOut)}</span>`;

  let errorBlock = '';
  if (span.errorMessage) {
    errorBlock = `<div class="error-msg">${esc(span.errorMessage)}</div>`;
  }

  // Tool-specific metadata
  let metaBlock = '';
  const md = span.metadata || {};
  if (span.spanType === 'tool_exec') {
    if (md.toolName) metaBlock += `<div class="span-meta"><strong>Tool:</strong> ${esc(String(md.toolName))}</div>`;
    if (md.arguments) metaBlock += `<div class="span-meta"><strong>Args:</strong> <code>${esc(typeof md.arguments === 'string' ? md.arguments : JSON.stringify(md.arguments))}</code></div>`;
    if (md.result !== undefined) metaBlock += `<div class="span-meta"><strong>Result:</strong> <code>${esc(typeof md.result === 'string' ? md.result : JSON.stringify(md.result)).slice(0, 500)}</code></div>`;
  }
  if (span.spanType === 'llm_call') {
    if (md.stopReason) metaBlock += `<div class="span-meta"><strong>Stop:</strong> ${esc(String(md.stopReason))}</div>`;
    if (md.cachedTokens) metaBlock += `<div class="span-meta"><strong>Cached:</strong> ${formatTokens(Number(md.cachedTokens))}</div>`;
  }
  if (span.spanType === 'delegation') {
    if (md.targetAgentId) metaBlock += `<div class="span-meta"><strong>Target:</strong> ${esc(String(md.targetAgentId))}</div>`;
    if (md.task) metaBlock += `<div class="span-meta"><strong>Task:</strong> ${esc(String(md.task))}</div>`;
  }

  const detailsSection = (metaBlock || errorBlock)
    ? `<details class="span-details"><summary>Details</summary>${metaBlock}${errorBlock}</details>`
    : '';

  return `
    <div class="child-span" style="${border}">
      <div class="span-header">
        ${statusDot(span.status)}
        <span class="span-type" style="color:${color}">${spanTypeLabel(span.spanType)}</span>
        <span class="span-name">${esc(name)}</span>
        <span class="span-metrics">${details}</span>
      </div>
      ${detailsSection}
    </div>`;
}

function renderTurn(turn: SpanNode, index: number): string {
  const md = turn.metadata || {};
  const userMsg = md.userMessage ? String(md.userMessage) : '';
  const assistantMsg = md.assistantMessage ? String(md.assistantMessage) : '';
  const isError = turn.status === 'error';

  const childSpans = turn.children
    .filter(c => c.spanType !== 'turn')
    .map(c => renderChildSpan(c))
    .join('');

  let messagesHtml = '';
  if (userMsg) {
    messagesHtml += `<div class="message user-msg"><div class="msg-label">User</div><div class="msg-body">${esc(userMsg)}</div></div>`;
  }
  if (assistantMsg) {
    messagesHtml += `<div class="message assistant-msg"><div class="msg-label">Assistant</div><div class="msg-body">${esc(assistantMsg)}</div></div>`;
  }

  const errorClass = isError ? ' turn-error' : '';

  return `
    <details class="turn${errorClass}">
      <summary class="turn-summary">
        <span class="turn-num">Turn ${index + 1}</span>
        ${statusDot(turn.status)}
        <span class="turn-metrics">
          ${turn.costUsd > 0 ? `<span class="meta">${formatCost(turn.costUsd)}</span>` : ''}
          <span class="meta">${formatTokens(turn.tokensIn)}→${formatTokens(turn.tokensOut)}</span>
          <span class="meta">${formatDuration(turn.durationMs)}</span>
          ${turn.children.length > 0 ? `<span class="meta">${turn.children.length} span${turn.children.length !== 1 ? 's' : ''}</span>` : ''}
        </span>
      </summary>
      <div class="turn-content">
        ${messagesHtml}
        ${childSpans ? `<div class="child-spans">${childSpans}</div>` : ''}
      </div>
    </details>`;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function renderSessionHtml(tree: SpanNode): string {
  const turns = tree.children.filter(c => c.spanType === 'turn');
  const turnCount = turns.length;
  const totalSpans = tree.children.reduce((s, t) => s + 1 + (t.children?.length || 0), 1);

  const turnsHtml = turns.map((t, i) => renderTurn(t, i)).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Session Replay — ${esc(tree.agentId)} — ${esc(tree.sessionId)}</title>
<style>
:root {
  --bg: #0f172a;
  --bg-card: #1e293b;
  --bg-card-alt: #334155;
  --border: #475569;
  --text: #e2e8f0;
  --text-dim: #94a3b8;
  --text-muted: #64748b;
  --green: #4ade80;
  --red: #f87171;
  --yellow: #fbbf24;
  --blue: #60a5fa;
  --purple: #a78bfa;
  --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.6;
  padding: 24px;
  max-width: 960px;
  margin: 0 auto;
}
a { color: var(--blue); text-decoration: none; }
code {
  font-family: var(--mono);
  background: var(--bg-card-alt);
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 0.85em;
  word-break: break-all;
}

/* Header */
.header { margin-bottom: 24px; }
.header h1 { font-size: 1.5rem; margin-bottom: 4px; }
.header .session-id { font-family: var(--mono); font-size: 0.85rem; color: var(--text-dim); }
.header .status { font-weight: 600; margin-left: 12px; }

/* Stats grid */
.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}
.stat {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px;
}
.stat-label { font-size: 0.75rem; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.05em; }
.stat-value { font-size: 1.1rem; font-weight: 600; font-family: var(--mono); }

/* Timestamps row */
.timestamps { font-size: 0.85rem; color: var(--text-dim); margin-bottom: 20px; display: flex; gap: 24px; flex-wrap: wrap; }
.timestamps span { color: var(--text-muted); }

/* Controls */
.controls { margin-bottom: 16px; display: flex; gap: 8px; }
.controls button {
  background: var(--bg-card);
  color: var(--text);
  border: 1px solid var(--border);
  padding: 6px 14px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
}
.controls button:hover { background: var(--bg-card-alt); }

/* Turn */
.turn {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  margin-bottom: 8px;
}
.turn-error { border-color: var(--red); }
.turn-summary {
  padding: 12px 16px;
  cursor: pointer;
  list-style: none;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9rem;
}
.turn-summary::-webkit-details-marker { display: none; }
.turn-summary::before {
  content: "▶";
  font-size: 0.65rem;
  color: var(--text-muted);
  transition: transform 0.15s;
}
.turn[open] > .turn-summary::before { transform: rotate(90deg); }
.turn-num { font-weight: 600; min-width: 60px; }
.turn-metrics { margin-left: auto; display: flex; gap: 12px; }
.meta { color: var(--text-dim); font-family: var(--mono); font-size: 0.8rem; }

/* Turn content */
.turn-content { padding: 0 16px 16px; }

/* Messages */
.message {
  border-radius: 6px;
  padding: 10px 14px;
  margin-bottom: 8px;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 0.9rem;
}
.user-msg { background: #1e3a5f; border: 1px solid #2563eb40; }
.assistant-msg { background: #1a2e1a; border: 1px solid #22c55e40; }
.msg-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-dim);
  margin-bottom: 4px;
  font-weight: 600;
}
.msg-body { line-height: 1.5; }

/* Child spans */
.child-spans { margin-top: 12px; }
.child-span {
  padding: 8px 12px;
  margin-bottom: 4px;
  background: var(--bg);
  border-radius: 4px;
}
.span-header { display: flex; align-items: center; gap: 6px; font-size: 0.85rem; flex-wrap: wrap; }
.span-type { font-weight: 600; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.03em; }
.span-name { color: var(--text); }
.span-metrics { margin-left: auto; display: flex; gap: 10px; }
.span-details { margin-top: 6px; font-size: 0.85rem; }
.span-details summary { cursor: pointer; color: var(--text-dim); font-size: 0.8rem; }
.span-meta { margin-top: 4px; color: var(--text-dim); }
.span-meta strong { color: var(--text); }
.error-msg {
  margin-top: 6px;
  background: #7f1d1d40;
  border: 1px solid #f8717140;
  border-radius: 4px;
  padding: 8px;
  color: var(--red);
  font-family: var(--mono);
  font-size: 0.8rem;
  white-space: pre-wrap;
}

/* Footer */
.footer {
  margin-top: 32px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 0.8rem;
  text-align: center;
}

/* Print */
@media print {
  body { background: #fff; color: #1e293b; padding: 12px; }
  .stat, .turn, .child-span { border-color: #cbd5e1; }
  .user-msg { background: #eff6ff; border-color: #bfdbfe; }
  .assistant-msg { background: #f0fdf4; border-color: #bbf7d0; }
  .controls { display: none; }
  .turn { break-inside: avoid; }
  :root { --bg: #fff; --bg-card: #f8fafc; --bg-card-alt: #f1f5f9; --border: #cbd5e1; --text: #1e293b; --text-dim: #64748b; --text-muted: #94a3b8; }
}
</style>
</head>
<body>

<div class="header">
  <h1>${esc(tree.name || `Session — ${tree.agentId}`)}</h1>
  <div>
    <span class="session-id">${esc(tree.sessionId)}</span>
    <span class="status" style="color:${tree.status === 'ok' ? 'var(--green)' : tree.status === 'error' ? 'var(--red)' : 'var(--yellow)'}">${esc(tree.status.toUpperCase())}</span>
  </div>
</div>

<div class="stats">
  <div class="stat"><div class="stat-label">Agent</div><div class="stat-value">${esc(tree.agentId)}</div></div>
  <div class="stat"><div class="stat-label">Channel</div><div class="stat-value">${esc(tree.channel || '-')}</div></div>
  <div class="stat"><div class="stat-label">Duration</div><div class="stat-value">${formatDuration(tree.durationMs)}</div></div>
  <div class="stat"><div class="stat-label">Total Cost</div><div class="stat-value">${formatCost(tree.costUsd)}</div></div>
  <div class="stat"><div class="stat-label">Tokens</div><div class="stat-value">${formatTokens(tree.tokensIn)} / ${formatTokens(tree.tokensOut)}</div></div>
  <div class="stat"><div class="stat-label">Turns / Spans</div><div class="stat-value">${turnCount} / ${totalSpans}</div></div>
</div>

<div class="timestamps">
  <div><span>Started:</span> ${formatTimestamp(tree.startTs)}</div>
  ${tree.endTs ? `<div><span>Ended:</span> ${formatTimestamp(tree.endTs)}</div>` : ''}
  ${tree.model ? `<div><span>Model:</span> ${esc(tree.model)}</div>` : ''}
</div>

<div class="controls">
  <button onclick="document.querySelectorAll('.turn').forEach(d=>d.open=true)">Expand All</button>
  <button onclick="document.querySelectorAll('.turn').forEach(d=>d.open=false)">Collapse All</button>
</div>

<div class="timeline">
${turnsHtml}
</div>

<div class="footer">
  Exported from ClawLens on ${new Date().toISOString().split('T')[0]}
</div>

</body>
</html>`;
}
