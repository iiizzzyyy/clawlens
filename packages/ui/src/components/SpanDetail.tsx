/**
 * SpanDetail component
 *
 * Modal or slide-out panel showing full span details.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { SpanTree } from '../api/client';

interface SpanDetailProps {
  span: SpanTree;
  onClose: () => void;
}

export default function SpanDetail({ span, onClose }: SpanDetailProps) {
  const [showRawJson, setShowRawJson] = useState(false);

  const formatDuration = (ms: number | null) => {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    return `${(ms / 60000).toFixed(2)}m`;
  };

  const formatTimestamp = (ts: number) => {
    return new Date(ts).toLocaleString();
  };

  const formatCost = (usd: number) => {
    if (usd < 0.001) return `$${(usd * 1000).toFixed(3)}m`;
    return `$${usd.toFixed(4)}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ok':
        return 'text-green-400';
      case 'error':
        return 'text-red-400';
      case 'timeout':
        return 'text-yellow-400';
      default:
        return 'text-slate-400';
    }
  };

  const getSpanTypeIcon = (type: string) => {
    switch (type) {
      case 'llm_call':
        return '🤖';
      case 'tool_exec':
        return '🔧';
      case 'memory_search':
        return '🔍';
      case 'delegation':
        return '📤';
      case 'turn':
        return '💬';
      case 'session':
        return '📋';
      default:
        return '📌';
    }
  };

  const renderMetadata = () => {
    const meta = span.metadata;
    if (!meta || Object.keys(meta).length === 0) return null;

    switch (span.spanType) {
      case 'tool_exec':
        return (
          <div className="space-y-4">
            {meta.toolName ? (
              <div>
                <h4 className="text-sm font-medium text-slate-400 mb-1">Tool</h4>
                <div className="text-white font-mono">{String(meta.toolName)}</div>
              </div>
            ) : null}
            {meta.toolArgs ? (
              <div>
                <h4 className="text-sm font-medium text-slate-400 mb-1">Arguments</h4>
                <pre className="bg-slate-900 p-3 rounded-lg text-sm text-slate-300 overflow-x-auto">
                  {JSON.stringify(meta.toolArgs, null, 2)}
                </pre>
              </div>
            ) : null}
            {meta.toolResult ? (
              <div>
                <h4 className="text-sm font-medium text-slate-400 mb-1">Result</h4>
                <pre className="bg-slate-900 p-3 rounded-lg text-sm text-slate-300 overflow-x-auto max-h-64 overflow-y-auto">
                  {typeof meta.toolResult === 'string'
                    ? meta.toolResult
                    : JSON.stringify(meta.toolResult, null, 2)}
                </pre>
              </div>
            ) : null}
            {meta.exitCode !== undefined ? (
              <div>
                <h4 className="text-sm font-medium text-slate-400 mb-1">Exit Code</h4>
                <div
                  className={`font-mono ${meta.exitCode === 0 ? 'text-green-400' : 'text-red-400'}`}
                >
                  {String(meta.exitCode)}
                </div>
              </div>
            ) : null}
          </div>
        );

      case 'llm_call':
        return (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="text-sm font-medium text-slate-400 mb-1">Model</h4>
                <div className="text-white">{span.model || '-'}</div>
              </div>
              <div>
                <h4 className="text-sm font-medium text-slate-400 mb-1">Provider</h4>
                <div className="text-white">{span.provider || '-'}</div>
              </div>
            </div>
            {meta.cachedTokens !== undefined ? (
              <div>
                <h4 className="text-sm font-medium text-slate-400 mb-1">Cached Tokens</h4>
                <div className="text-white">{String(meta.cachedTokens)}</div>
              </div>
            ) : null}
            {meta.stopReason ? (
              <div>
                <h4 className="text-sm font-medium text-slate-400 mb-1">Stop Reason</h4>
                <div className="text-white font-mono">{String(meta.stopReason)}</div>
              </div>
            ) : null}
          </div>
        );

      case 'delegation':
        return (
          <div className="space-y-3">
            {meta.targetAgentId ? (
              <div>
                <h4 className="text-sm font-medium text-slate-400 mb-1">Target Agent</h4>
                <div className="text-white">{String(meta.targetAgentId)}</div>
              </div>
            ) : null}
            {meta.delegationType ? (
              <div>
                <h4 className="text-sm font-medium text-slate-400 mb-1">Delegation Type</h4>
                <div className="text-white font-mono">{String(meta.delegationType)}</div>
              </div>
            ) : null}
            {meta.targetSessionId ? (
              <div>
                <h4 className="text-sm font-medium text-slate-400 mb-1">Target Session</h4>
                <Link
                  to={`/replay/${meta.targetSessionId}`}
                  className="text-accent-400 hover:text-accent-300 underline"
                >
                  View session: {String(meta.targetSessionId)}
                </Link>
              </div>
            ) : null}
            {meta.task ? (
              <div>
                <h4 className="text-sm font-medium text-slate-400 mb-1">Task</h4>
                <div className="text-white">{String(meta.task)}</div>
              </div>
            ) : null}
          </div>
        );

      case 'memory_search':
        return (
          <div className="space-y-3">
            {meta.query ? (
              <div>
                <h4 className="text-sm font-medium text-slate-400 mb-1">Query</h4>
                <div className="text-white italic">"{String(meta.query)}"</div>
              </div>
            ) : null}
            {meta.resultsCount !== undefined ? (
              <div>
                <h4 className="text-sm font-medium text-slate-400 mb-1">Results Count</h4>
                <div className="text-white">{String(meta.resultsCount)}</div>
              </div>
            ) : null}
            {meta.searchType ? (
              <div>
                <h4 className="text-sm font-medium text-slate-400 mb-1">Search Type</h4>
                <div className="text-white font-mono">{String(meta.searchType)}</div>
              </div>
            ) : null}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-end z-50">
      <div className="w-full max-w-lg h-full bg-slate-800 shadow-xl overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-slate-800 border-b border-slate-700 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{getSpanTypeIcon(span.spanType)}</span>
            <div>
              <h2 className="text-lg font-bold text-white">{span.name}</h2>
              <span className="text-sm text-slate-400">{span.spanType}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-700"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Status & Timing */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="text-sm font-medium text-slate-400 mb-1">Status</h4>
              <div className={`font-medium ${getStatusColor(span.status)}`}>
                {span.status.toUpperCase()}
              </div>
            </div>
            <div>
              <h4 className="text-sm font-medium text-slate-400 mb-1">Duration</h4>
              <div className="text-white font-mono">{formatDuration(span.durationMs)}</div>
            </div>
            <div>
              <h4 className="text-sm font-medium text-slate-400 mb-1">Start</h4>
              <div className="text-white text-sm">{formatTimestamp(span.startTs)}</div>
            </div>
            <div>
              <h4 className="text-sm font-medium text-slate-400 mb-1">End</h4>
              <div className="text-white text-sm">
                {span.endTs ? formatTimestamp(span.endTs) : '-'}
              </div>
            </div>
          </div>

          {/* Cost & Tokens */}
          {(span.costUsd > 0 || span.tokensIn > 0 || span.tokensOut > 0) && (
            <div className="border-t border-slate-700 pt-4">
              <h3 className="text-sm font-medium text-slate-300 mb-3">Cost & Tokens</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-slate-400 mb-1">Total Cost</h4>
                  <div className="text-white font-mono">{formatCost(span.costUsd)}</div>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-slate-400 mb-1">Tokens In</h4>
                  <div className="text-white font-mono">{span.tokensIn.toLocaleString()}</div>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-slate-400 mb-1">Tokens Out</h4>
                  <div className="text-white font-mono">{span.tokensOut.toLocaleString()}</div>
                </div>
              </div>
            </div>
          )}

          {/* Error message */}
          {span.errorMessage && (
            <div className="border-t border-slate-700 pt-4">
              <h3 className="text-sm font-medium text-red-400 mb-2">Error</h3>
              <pre className="bg-red-900/20 border border-red-700 p-3 rounded-lg text-sm text-red-300 whitespace-pre-wrap">
                {span.errorMessage}
              </pre>
            </div>
          )}

          {/* Type-specific metadata */}
          {renderMetadata() && (
            <div className="border-t border-slate-700 pt-4">
              <h3 className="text-sm font-medium text-slate-300 mb-3">Details</h3>
              {renderMetadata()}
            </div>
          )}

          {/* Raw JSON toggle */}
          <div className="border-t border-slate-700 pt-4">
            <button
              onClick={() => setShowRawJson(!showRawJson)}
              className="text-sm text-slate-400 hover:text-white flex items-center gap-2"
            >
              {showRawJson ? '▼' : '▶'} Raw JSON
            </button>
            {showRawJson && (
              <pre className="mt-3 bg-slate-900 p-3 rounded-lg text-xs text-slate-300 overflow-x-auto max-h-96 overflow-y-auto">
                {JSON.stringify(span, null, 2)}
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
