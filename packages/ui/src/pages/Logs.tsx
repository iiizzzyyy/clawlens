/**
 * Real-Time Log Streaming page
 *
 * Color-coded live log viewer that streams agent logs via SSE.
 * Supports filtering by level, agent, and text search.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LogLine {
  timestamp: string;
  level: 'error' | 'warn' | 'info' | 'debug';
  agent: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_LINES = 2000;

const LEVEL_COLORS: Record<string, string> = {
  error: 'text-red-400',
  warn: 'text-yellow-400',
  info: 'text-blue-400',
  debug: 'text-slate-500',
};

const LEVEL_BG: Record<string, string> = {
  error: 'bg-red-400/20 text-red-400',
  warn: 'bg-yellow-400/20 text-yellow-400',
  info: 'bg-blue-400/20 text-blue-400',
  debug: 'bg-slate-500/20 text-slate-500',
};

const LEVEL_OPTIONS = ['all', 'error', 'warn', 'info', 'debug'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    return d.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return ts;
  }
}

function buildSseUrl(filters: { level: string; agent: string; search: string }): string {
  const base = `${window.location.origin}/clawlens/api/logs/stream`;
  const params = new URLSearchParams();
  if (filters.level && filters.level !== 'all') params.set('level', filters.level);
  if (filters.agent) params.set('agent', filters.agent);
  if (filters.search) params.set('search', filters.search);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function ConnectionStatus({ connected }: { connected: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <div
        className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`}
      />
      <span className={connected ? 'text-green-400' : 'text-red-400'}>
        {connected ? 'Connected' : 'Disconnected'}
      </span>
    </div>
  );
}

function LevelBadge({ level }: { level: string }) {
  return (
    <span
      className={`inline-block w-14 text-center px-1.5 py-0.5 rounded text-xs font-bold uppercase ${
        LEVEL_BG[level] ?? 'bg-slate-600/20 text-slate-400'
      }`}
    >
      {level}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function Logs() {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [connected, setConnected] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);

  // Filters
  const [levelFilter, setLevelFilter] = useState('all');
  const [agentFilter, setAgentFilter] = useState('');
  const [searchFilter, setSearchFilter] = useState('');

  // Debounced filter values (to avoid reconnecting on every keystroke)
  const [debouncedAgent, setDebouncedAgent] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);
  const sourceRef = useRef<EventSource | null>(null);

  // Debounce agent and search inputs
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedAgent(agentFilter), 400);
    return () => clearTimeout(timer);
  }, [agentFilter]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchFilter), 400);
    return () => clearTimeout(timer);
  }, [searchFilter]);

  // SSE connection — reconnects when filters change
  useEffect(() => {
    // Close previous connection
    if (sourceRef.current) {
      sourceRef.current.close();
      sourceRef.current = null;
    }

    const url = buildSseUrl({
      level: levelFilter,
      agent: debouncedAgent,
      search: debouncedSearch,
    });

    const source = new EventSource(url);
    sourceRef.current = source;

    source.onopen = () => {
      setConnected(true);
    };

    source.onmessage = (event) => {
      try {
        const logLine = JSON.parse(event.data) as LogLine;
        setLines((prev) => {
          const next = [...prev, logLine];
          return next.length > MAX_LINES ? next.slice(-MAX_LINES) : next;
        });
      } catch {
        // Ignore unparseable messages (keepalive comments, etc.)
      }
    };

    source.onerror = () => {
      setConnected(false);
    };

    return () => {
      source.close();
      setConnected(false);
    };
  }, [levelFilter, debouncedAgent, debouncedSearch]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [lines.length, autoScroll]);

  // Detect user scrolling up
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAutoScroll(atBottom);
  }, []);

  const handleResume = useCallback(() => {
    setAutoScroll(true);
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, []);

  const handleClear = useCallback(() => {
    setLines([]);
  }, []);

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Logs</h1>
          <p className="text-sm text-slate-400 mt-1">
            Real-time agent log streaming
          </p>
        </div>
        <ConnectionStatus connected={connected} />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        {/* Level dropdown */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400 uppercase tracking-wide">Level</label>
          <select
            value={levelFilter}
            onChange={(e) => {
              setLevelFilter(e.target.value);
              setLines([]);
            }}
            className="bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-slate-400"
          >
            {LEVEL_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt === 'all' ? 'All Levels' : opt.charAt(0).toUpperCase() + opt.slice(1)}
              </option>
            ))}
          </select>
        </div>

        {/* Agent input */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400 uppercase tracking-wide">Agent</label>
          <input
            type="text"
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
            placeholder="Filter by agent..."
            className="bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-slate-400 w-40"
          />
        </div>

        {/* Search input */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400 uppercase tracking-wide">Search</label>
          <input
            type="text"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder="Search messages..."
            className="bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-slate-400 w-48"
          />
        </div>

        {/* Clear button */}
        <button
          onClick={handleClear}
          className="ml-auto px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors"
        >
          Clear
        </button>

        {/* Line count */}
        <span className="text-xs text-slate-500">{lines.length} lines</span>
      </div>

      {/* Log viewer */}
      <div className="flex-1 bg-slate-800 rounded-xl border border-slate-700 overflow-hidden flex flex-col min-h-0">
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-3 font-mono text-xs leading-relaxed"
        >
          {lines.length === 0 ? (
            <div className="flex items-center justify-center h-full text-slate-500">
              {connected
                ? 'Waiting for log lines...'
                : 'Connecting to log stream...'}
            </div>
          ) : (
            lines.map((line, i) => (
              <div
                key={`${line.timestamp}-${i}`}
                className="flex items-start gap-2 px-2 py-0.5 hover:bg-slate-700/40 rounded"
              >
                <span className="text-slate-500 shrink-0 w-20">
                  {formatTimestamp(line.timestamp)}
                </span>
                <span className="shrink-0">
                  <LevelBadge level={line.level} />
                </span>
                {line.agent && (
                  <span className="text-cyan-400 shrink-0 w-28 truncate">
                    [{line.agent}]
                  </span>
                )}
                <span className={`break-all ${LEVEL_COLORS[line.level] ?? 'text-slate-300'}`}>
                  {line.message}
                </span>
              </div>
            ))
          )}
        </div>

        {/* Resume auto-scroll button */}
        {!autoScroll && (
          <button
            onClick={handleResume}
            className="w-full py-1.5 text-xs text-center text-cyan-400 hover:bg-slate-700 border-t border-slate-700 transition-colors"
          >
            New logs below — click to resume auto-scroll
          </button>
        )}
      </div>
    </div>
  );
}
