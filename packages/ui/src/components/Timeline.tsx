/**
 * Timeline component
 *
 * Vertical timeline of turns - the main replay view.
 * Each turn is a collapsible card with expandable details.
 */

import { useState, useCallback, useEffect } from 'react';
import type { SpanTree } from '../api/client';
import Waterfall from './Waterfall';
import SpanDetail from './SpanDetail';

interface TimelineProps {
  sessionTree: SpanTree;
}

export default function Timeline({ sessionTree }: TimelineProps) {
  const [expandedTurns, setExpandedTurns] = useState<Set<string>>(new Set());
  const [selectedSpan, setSelectedSpan] = useState<SpanTree | null>(null);
  const [focusedTurnIndex, setFocusedTurnIndex] = useState<number>(0);

  // Extract turns from session tree
  const turns = sessionTree.children.filter((child) => child.spanType === 'turn');

  // Toggle turn expansion
  const toggleTurn = useCallback((turnId: string) => {
    setExpandedTurns((prev) => {
      const next = new Set(prev);
      if (next.has(turnId)) {
        next.delete(turnId);
      } else {
        next.add(turnId);
      }
      return next;
    });
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (selectedSpan) {
        if (e.key === 'Escape') {
          setSelectedSpan(null);
        }
        return;
      }

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          setFocusedTurnIndex((prev) => Math.max(0, prev - 1));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setFocusedTurnIndex((prev) => Math.min(turns.length - 1, prev + 1));
          break;
        case 'Enter':
          e.preventDefault();
          if (turns[focusedTurnIndex]) {
            toggleTurn(turns[focusedTurnIndex].id);
          }
          break;
        case 'Escape':
          e.preventDefault();
          // Collapse all
          setExpandedTurns(new Set());
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [turns, focusedTurnIndex, selectedSpan, toggleTurn]);

  const formatDuration = (ms: number | null) => {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString();
  };

  const formatCost = (usd: number) => {
    if (usd < 0.001) return `$${(usd * 1000).toFixed(2)}m`;
    return `$${usd.toFixed(4)}`;
  };

  const getStatusDot = (status: string) => {
    switch (status) {
      case 'ok':
        return 'bg-green-400';
      case 'error':
        return 'bg-red-400';
      case 'timeout':
        return 'bg-yellow-400';
      default:
        return 'bg-slate-400';
    }
  };

  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + '...';
  };

  const getToolCount = (turn: SpanTree) => {
    return turn.children.filter((c) => c.spanType === 'tool_exec').length;
  };

  return (
    <div className="relative">
      {/* Keyboard navigation hint */}
      <div className="mb-4 text-xs text-slate-500 flex gap-4">
        <span>↑↓ Navigate turns</span>
        <span>Enter Expand/collapse</span>
        <span>Esc Close details</span>
      </div>

      {/* Timeline */}
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-[30px] top-0 bottom-0 w-0.5 bg-slate-700"></div>

        {/* Turns */}
        <div className="space-y-4">
          {turns.map((turn, index) => {
            const isExpanded = expandedTurns.has(turn.id);
            const isFocused = index === focusedTurnIndex;
            const userMessage = typeof turn.metadata.userMessage === 'string' ? turn.metadata.userMessage : '';
            const assistantMessage = typeof turn.metadata.assistantMessage === 'string' ? turn.metadata.assistantMessage : '';
            const toolCount = getToolCount(turn);

            return (
              <div
                key={turn.id}
                className={`relative ml-12 ${isFocused ? 'ring-2 ring-accent-500 rounded-lg' : ''}`}
              >
                {/* Timeline dot */}
                <div
                  className={`absolute -left-[30px] top-4 w-4 h-4 rounded-full border-2 border-slate-800 ${getStatusDot(turn.status)}`}
                ></div>

                {/* Timestamp on the line */}
                <div className="absolute -left-[90px] top-3 text-xs text-slate-500 w-[50px] text-right">
                  {formatTime(turn.startTs)}
                </div>

                {/* Turn card */}
                <div
                  className={`bg-slate-800 rounded-lg border ${
                    turn.status === 'error' ? 'border-red-700' : 'border-slate-700'
                  } overflow-hidden`}
                >
                  {/* Card header (clickable) */}
                  <div
                    onClick={() => toggleTurn(turn.id)}
                    className="px-4 py-3 cursor-pointer hover:bg-slate-700/50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {/* Expand indicator */}
                        <span className="text-slate-400 w-4">
                          {isExpanded ? '▼' : '▶'}
                        </span>

                        {/* Turn number */}
                        <span className="text-sm font-bold text-white">Turn {index + 1}</span>

                        {/* Status dot */}
                        <div className={`w-2 h-2 rounded-full ${getStatusDot(turn.status)}`}></div>

                        {/* Tool count badge */}
                        {toolCount > 0 && (
                          <span className="px-2 py-0.5 text-xs bg-purple-900/50 text-purple-300 rounded-full">
                            {toolCount} tool{toolCount > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>

                      {/* Metrics */}
                      <div className="flex items-center gap-4 text-sm text-slate-400">
                        <span className="font-mono">{formatCost(turn.costUsd)}</span>
                        <span>
                          {turn.tokensIn.toLocaleString()} / {turn.tokensOut.toLocaleString()} tok
                        </span>
                        <span>{formatDuration(turn.durationMs)}</span>
                      </div>
                    </div>

                    {/* Message previews */}
                    <div className="mt-2 space-y-1">
                      {userMessage && (
                        <div className="text-sm">
                          <span className="text-blue-400 font-medium">User:</span>{' '}
                          <span className="text-slate-300">
                            {truncateText(userMessage, 200)}
                          </span>
                        </div>
                      )}
                      {assistantMessage && (
                        <div className="text-sm">
                          <span className="text-green-400 font-medium">Assistant:</span>{' '}
                          <span className="text-slate-300">
                            {truncateText(assistantMessage, 200)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="border-t border-slate-700 px-4 py-4 space-y-4">
                      {/* Full messages */}
                      {userMessage && (
                        <div>
                          <h4 className="text-sm font-medium text-blue-400 mb-2">User Message</h4>
                          <div className="bg-slate-900 p-3 rounded-lg text-sm text-slate-300 whitespace-pre-wrap">
                            {userMessage}
                          </div>
                        </div>
                      )}

                      {assistantMessage && (
                        <div>
                          <h4 className="text-sm font-medium text-green-400 mb-2">
                            Assistant Response
                          </h4>
                          <div className="bg-slate-900 p-3 rounded-lg text-sm text-slate-300 whitespace-pre-wrap">
                            {assistantMessage}
                          </div>
                        </div>
                      )}

                      {/* Child spans waterfall */}
                      {turn.children.length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium text-slate-300 mb-2">
                            Execution Timeline
                          </h4>
                          <Waterfall
                            spans={turn.children}
                            turnStart={turn.startTs}
                            turnEnd={turn.endTs || turn.startTs + (turn.durationMs || 0)}
                            onSpanClick={setSelectedSpan}
                          />
                        </div>
                      )}

                      {/* Context assembly info */}
                      {turn.metadata.contextTokens ? (
                        <div>
                          <h4 className="text-sm font-medium text-slate-300 mb-2">
                            Context Assembly
                          </h4>
                          <div className="grid grid-cols-4 gap-2 text-sm">
                            <div className="bg-slate-900 p-2 rounded">
                              <div className="text-slate-400 text-xs">History</div>
                              <div className="text-white font-mono">
                                {((turn.metadata.contextTokens as Record<string, number>)?.history || 0).toLocaleString()}
                              </div>
                            </div>
                            <div className="bg-slate-900 p-2 rounded">
                              <div className="text-slate-400 text-xs">Memory</div>
                              <div className="text-white font-mono">
                                {((turn.metadata.contextTokens as Record<string, number>)?.memory || 0).toLocaleString()}
                              </div>
                            </div>
                            <div className="bg-slate-900 p-2 rounded">
                              <div className="text-slate-400 text-xs">System</div>
                              <div className="text-white font-mono">
                                {((turn.metadata.contextTokens as Record<string, number>)?.system || 0).toLocaleString()}
                              </div>
                            </div>
                            <div className="bg-slate-900 p-2 rounded">
                              <div className="text-slate-400 text-xs">Total</div>
                              <div className="text-white font-mono">
                                {((turn.metadata.contextTokens as Record<string, number>)?.total || 0).toLocaleString()}
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Span detail panel */}
      {selectedSpan && (
        <SpanDetail span={selectedSpan} onClose={() => setSelectedSpan(null)} />
      )}
    </div>
  );
}
