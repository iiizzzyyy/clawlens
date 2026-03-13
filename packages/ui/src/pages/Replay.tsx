/**
 * Session Replay page
 *
 * Displays turn-by-turn timeline of agent conversations with cost, tokens,
 * tool execution, and timing annotations.
 */

import { useParams, Link } from 'react-router-dom';
import { useSessionReplay } from '../hooks/useSession';
import { getMockSessionReplay } from '../mocks/session-replay';
import CostBar from '../components/CostBar';
import Timeline from '../components/Timeline';

// Use mock data in development when API is not available
const USE_MOCK_DATA = true;

export default function Replay() {
  const { sessionId } = useParams<{ sessionId: string }>();

  // Try to fetch from API
  const { sessionTree: apiData, loading, error } = useSessionReplay(sessionId || '');

  // Use mock data if API fails or in dev mode
  const mockData = sessionId ? getMockSessionReplay(sessionId) : null;
  const sessionTree = USE_MOCK_DATA && mockData ? mockData : apiData;

  const formatDuration = (ms: number | null) => {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const formatTimestamp = (ts: number) => {
    return new Date(ts).toLocaleString();
  };

  const formatCost = (usd: number) => {
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

  // Loading state
  if (loading && !sessionTree) {
    return (
      <div className="space-y-6">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-slate-400 hover:text-slate-300"
        >
          <span>←</span> Back to sessions
        </Link>
        <div className="flex items-center justify-center py-20">
          <div className="text-slate-400">Loading session replay...</div>
        </div>
      </div>
    );
  }

  // Error state (when no mock data available)
  if (error && !sessionTree) {
    return (
      <div className="space-y-6">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-slate-400 hover:text-slate-300"
        >
          <span>←</span> Back to sessions
        </Link>
        <div className="bg-red-900/20 border border-red-700 text-red-300 rounded-lg p-4">
          <strong>Error loading session:</strong> {error}
        </div>
      </div>
    );
  }

  // No data state
  if (!sessionTree) {
    return (
      <div className="space-y-6">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-slate-400 hover:text-slate-300"
        >
          <span>←</span> Back to sessions
        </Link>
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-8 text-center">
          <div className="text-6xl mb-4">🔍</div>
          <h2 className="text-2xl font-bold text-white mb-2">Session Not Found</h2>
          <p className="text-slate-400">
            The session <code className="bg-slate-700 px-2 py-1 rounded">{sessionId}</code> could
            not be found.
          </p>
          <p className="text-slate-500 text-sm mt-4">
            Try using <code className="bg-slate-700 px-1 rounded">mock</code> as the session ID to
            see a demo.
          </p>
        </div>
      </div>
    );
  }

  // Count turns and child spans
  const turnCount = sessionTree.children.filter((c) => c.spanType === 'turn').length;
  const totalSpans = sessionTree.children.reduce(
    (sum, turn) => sum + 1 + (turn.children?.length || 0),
    1
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-slate-400 hover:text-slate-300 mb-4"
        >
          <span>←</span> Back to sessions
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">{sessionTree.name}</h1>
            <div className="flex items-center gap-4 text-slate-400">
              <span className="font-mono text-sm">{sessionId}</span>
              <span className={`font-medium ${getStatusColor(sessionTree.status)}`}>
                {sessionTree.status.toUpperCase()}
              </span>
            </div>
          </div>
          {/* Mock data indicator */}
          {USE_MOCK_DATA && mockData && (
            <div className="px-3 py-1 bg-yellow-900/30 border border-yellow-700 rounded-lg text-yellow-400 text-sm">
              Mock Data
            </div>
          )}
        </div>
      </div>

      {/* Session summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <div className="text-sm text-slate-400">Agent</div>
          <div className="text-lg font-medium text-white">{sessionTree.agentId}</div>
        </div>
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <div className="text-sm text-slate-400">Channel</div>
          <div className="text-lg font-medium text-white">{sessionTree.channel || '-'}</div>
        </div>
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <div className="text-sm text-slate-400">Duration</div>
          <div className="text-lg font-medium text-white font-mono">
            {formatDuration(sessionTree.durationMs)}
          </div>
        </div>
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <div className="text-sm text-slate-400">Total Cost</div>
          <div className="text-lg font-medium text-white font-mono">
            {formatCost(sessionTree.costUsd)}
          </div>
        </div>
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <div className="text-sm text-slate-400">Tokens</div>
          <div className="text-lg font-medium text-white font-mono">
            {sessionTree.tokensIn.toLocaleString()} / {sessionTree.tokensOut.toLocaleString()}
          </div>
        </div>
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <div className="text-sm text-slate-400">Turns / Spans</div>
          <div className="text-lg font-medium text-white">
            {turnCount} / {totalSpans}
          </div>
        </div>
      </div>

      {/* Timestamps */}
      <div className="flex gap-8 text-sm text-slate-400">
        <div>
          <span className="text-slate-500">Started:</span>{' '}
          {formatTimestamp(sessionTree.startTs)}
        </div>
        {sessionTree.endTs && (
          <div>
            <span className="text-slate-500">Ended:</span>{' '}
            {formatTimestamp(sessionTree.endTs)}
          </div>
        )}
        {sessionTree.model && (
          <div>
            <span className="text-slate-500">Model:</span> {sessionTree.model}
          </div>
        )}
      </div>

      {/* Cost bar */}
      <CostBar sessionTree={sessionTree} />

      {/* Timeline */}
      <Timeline sessionTree={sessionTree} />
    </div>
  );
}
