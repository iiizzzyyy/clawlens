/**
 * Waterfall component
 *
 * Horizontal bar chart showing child spans within a turn.
 * Bars are positioned by start_ts relative to the turn start.
 */

import { useMemo } from 'react';
import type { SpanTree } from '../api/client';

interface WaterfallProps {
  spans: SpanTree[];
  turnStart: number;
  turnEnd: number;
  onSpanClick: (span: SpanTree) => void;
}

interface WaterfallBar {
  span: SpanTree;
  left: number; // percentage from turn start
  width: number; // percentage of turn duration
  row: number; // vertical position (for overlapping spans)
}

export default function Waterfall({ spans, turnStart, turnEnd, onSpanClick }: WaterfallProps) {
  const turnDuration = turnEnd - turnStart;

  // Calculate bar positions and handle overlapping
  const bars = useMemo(() => {
    if (turnDuration === 0) return [];

    // Sort spans by start time
    const sortedSpans = [...spans].sort((a, b) => a.startTs - b.startTs);

    // Track end times for each row to handle overlapping
    const rowEndTimes: number[] = [];
    const result: WaterfallBar[] = [];

    for (const span of sortedSpans) {
      const left = ((span.startTs - turnStart) / turnDuration) * 100;
      const width = ((span.durationMs || 0) / turnDuration) * 100;

      // Find a row where this span doesn't overlap
      let row = 0;
      while (row < rowEndTimes.length && rowEndTimes[row] > span.startTs) {
        row++;
      }
      rowEndTimes[row] = span.endTs || span.startTs;

      result.push({
        span,
        left: Math.max(0, left),
        width: Math.max(1, Math.min(100 - left, width)), // Ensure minimum width and don't exceed 100%
        row,
      });
    }

    return result;
  }, [spans, turnStart, turnDuration]);

  const maxRow = useMemo(() => Math.max(0, ...bars.map((b) => b.row)), [bars]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ok':
        return 'bg-green-500';
      case 'error':
        return 'bg-red-500';
      case 'timeout':
        return 'bg-yellow-500';
      default:
        return 'bg-slate-500';
    }
  };

  const getSpanTypeColor = (type: string) => {
    switch (type) {
      case 'llm_call':
        return 'bg-blue-500';
      case 'tool_exec':
        return 'bg-purple-500';
      case 'memory_search':
        return 'bg-cyan-500';
      case 'delegation':
        return 'bg-orange-500';
      default:
        return 'bg-slate-500';
    }
  };

  const formatDuration = (ms: number | null) => {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const getSpanIcon = (type: string) => {
    switch (type) {
      case 'llm_call':
        return '🤖';
      case 'tool_exec':
        return '🔧';
      case 'memory_search':
        return '🔍';
      case 'delegation':
        return '📤';
      default:
        return '📌';
    }
  };

  if (bars.length === 0) {
    return (
      <div className="text-sm text-slate-500 italic py-2">No child spans</div>
    );
  }

  return (
    <div className="space-y-1">
      {/* Time ruler */}
      <div className="relative h-4 text-xs text-slate-500">
        <span className="absolute left-0">0ms</span>
        <span className="absolute left-1/4 -translate-x-1/2">
          {formatDuration(turnDuration * 0.25)}
        </span>
        <span className="absolute left-1/2 -translate-x-1/2">
          {formatDuration(turnDuration * 0.5)}
        </span>
        <span className="absolute left-3/4 -translate-x-1/2">
          {formatDuration(turnDuration * 0.75)}
        </span>
        <span className="absolute right-0">{formatDuration(turnDuration)}</span>
      </div>

      {/* Waterfall bars */}
      <div
        className="relative bg-slate-900 rounded-lg"
        style={{ height: `${(maxRow + 1) * 32 + 8}px` }}
      >
        {/* Grid lines */}
        <div className="absolute inset-0 flex">
          <div className="w-1/4 border-r border-slate-700/50"></div>
          <div className="w-1/4 border-r border-slate-700/50"></div>
          <div className="w-1/4 border-r border-slate-700/50"></div>
          <div className="w-1/4"></div>
        </div>

        {/* Bars */}
        {bars.map((bar) => (
          <div
            key={bar.span.id}
            className={`absolute h-6 rounded cursor-pointer hover:ring-2 hover:ring-white/50 transition-all flex items-center px-2 overflow-hidden ${
              bar.span.status === 'error'
                ? getStatusColor(bar.span.status)
                : getSpanTypeColor(bar.span.spanType)
            }`}
            style={{
              left: `${bar.left}%`,
              width: `${bar.width}%`,
              top: `${bar.row * 32 + 4}px`,
              minWidth: '20px',
            }}
            onClick={() => onSpanClick(bar.span)}
            title={`${bar.span.name} (${formatDuration(bar.span.durationMs)})`}
          >
            <span className="text-xs text-white truncate flex items-center gap-1">
              <span>{getSpanIcon(bar.span.spanType)}</span>
              <span className="font-medium">{bar.span.name}</span>
              <span className="text-white/70 ml-1">{formatDuration(bar.span.durationMs)}</span>
            </span>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex gap-4 mt-2 text-xs text-slate-400">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-blue-500"></div>
          <span>LLM</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-purple-500"></div>
          <span>Tool</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-cyan-500"></div>
          <span>Memory</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-orange-500"></div>
          <span>Delegation</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-red-500"></div>
          <span>Error</span>
        </div>
      </div>
    </div>
  );
}
