/**
 * Session List page
 *
 * Displays a table of all sessions with filters and sorting.
 */

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessions } from '../hooks/useSession';
import type { SessionSummary, SessionListFilters, SpanStatus } from '../api/client';

type SortField = keyof SessionSummary;
type SortDirection = 'asc' | 'desc';

export default function SessionList() {
  const navigate = useNavigate();

  // Filters
  const [agentId, setAgentId] = useState('');
  const [status, setStatus] = useState<SpanStatus | ''>('');
  const [fromTs, setFromTs] = useState('');
  const [toTs, setToTs] = useState('');

  // Sorting
  const [sortField, setSortField] = useState<SortField>('startTs');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Build filters object
  const filters: SessionListFilters = useMemo(() => {
    const f: SessionListFilters = { limit: 100 };
    if (agentId) f.agentId = agentId;
    if (status) f.status = status as SpanStatus;
    if (fromTs) f.fromTs = new Date(fromTs).getTime();
    if (toTs) f.toTs = new Date(toTs).getTime();
    return f;
  }, [agentId, status, fromTs, toTs]);

  // Fetch sessions
  const { sessions, loading, error, refetch } = useSessions(filters);

  // Sort sessions
  const sortedSessions = useMemo(() => {
    const sorted = [...sessions];
    sorted.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];

      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      let comparison = 0;
      if (aVal < bVal) comparison = -1;
      if (aVal > bVal) comparison = 1;

      return sortDirection === 'asc' ? comparison : -comparison;
    });
    return sorted;
  }, [sessions, sortField, sortDirection]);

  // Get unique values for filter dropdowns
  const uniqueAgents = useMemo(
    () => Array.from(new Set(sessions.map((s) => s.agentId))),
    [sessions]
  );
  // Handlers
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const handleRowClick = (sessionId: string) => {
    navigate(`/replay/${sessionId}`);
  };

  const resetFilters = () => {
    setAgentId('');
    setStatus('');
    setFromTs('');
    setToTs('');
  };

  // Status color mapping
  const getStatusColor = (status: SpanStatus) => {
    switch (status) {
      case 'ok':
        return 'bg-green-900/30 text-green-300';
      case 'error':
        return 'bg-red-900/30 text-red-300';
      case 'timeout':
        return 'bg-yellow-900/30 text-yellow-300';
      case 'cancelled':
        return 'bg-gray-900/30 text-gray-300';
      default:
        return 'bg-gray-900/30 text-gray-300';
    }
  };

  const formatDuration = (ms: number | null) => {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const formatTokens = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  };

  const formatTimestamp = (ts: number) => {
    return new Date(ts).toLocaleString();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Sessions</h1>
        <p className="text-slate-400">Browse and replay agent conversations</p>
      </div>

      {/* Filters */}
      <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Agent filter */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Agent</label>
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-accent-500"
            >
              <option value="">All agents</option>
              {uniqueAgents.map((agent) => (
                <option key={agent} value={agent}>
                  {agent}
                </option>
              ))}
            </select>
          </div>

          {/* Status filter */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as SpanStatus | '')}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-accent-500"
            >
              <option value="">All statuses</option>
              <option value="ok">OK</option>
              <option value="error">Error</option>
              <option value="timeout">Timeout</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {/* From date */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">From</label>
            <input
              type="datetime-local"
              value={fromTs}
              onChange={(e) => setFromTs(e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-accent-500"
            />
          </div>

          {/* To date */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">To</label>
            <input
              type="datetime-local"
              value={toTs}
              onChange={(e) => setToTs(e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-accent-500"
            />
          </div>

          {/* Reset button */}
          <div className="flex items-end">
            <button
              onClick={resetFilters}
              className="w-full bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Reset Filters
            </button>
          </div>
        </div>
      </div>

      {/* Loading / Error */}
      {loading && (
        <div className="text-center py-12 text-slate-400">Loading sessions...</div>
      )}

      {error && (
        <div className="bg-red-900/20 border border-red-700 text-red-300 rounded-lg p-4">
          <strong>Error:</strong> {error}
          <button
            onClick={() => refetch()}
            className="ml-4 text-red-200 underline hover:text-red-100"
          >
            Retry
          </button>
        </div>
      )}

      {/* Table */}
      {!loading && !error && (
        <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-700 text-slate-300 text-sm">
                <tr>
                  <th
                    onClick={() => handleSort('agentId')}
                    className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-slate-600"
                  >
                    Agent {sortField === 'agentId' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    onClick={() => handleSort('startTs')}
                    className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-slate-600"
                  >
                    Start Time {sortField === 'startTs' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    onClick={() => handleSort('durationMs')}
                    className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-slate-600"
                  >
                    Duration {sortField === 'durationMs' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    onClick={() => handleSort('totalTokensIn')}
                    className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-slate-600"
                  >
                    Tokens In {sortField === 'totalTokensIn' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    onClick={() => handleSort('totalTokensOut')}
                    className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-slate-600"
                  >
                    Tokens Out {sortField === 'totalTokensOut' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    onClick={() => handleSort('toolCalls')}
                    className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-slate-600"
                  >
                    Tools {sortField === 'toolCalls' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    onClick={() => handleSort('status')}
                    className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-slate-600"
                  >
                    Status {sortField === 'status' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    onClick={() => handleSort('errorCount')}
                    className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-slate-600"
                  >
                    Errors {sortField === 'errorCount' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    onClick={() => handleSort('spanCount')}
                    className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-slate-600"
                  >
                    Spans {sortField === 'spanCount' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {sortedSessions.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                      No sessions found
                    </td>
                  </tr>
                ) : (
                  sortedSessions.map((session) => (
                    <tr
                      key={session.sessionId}
                      onClick={() => handleRowClick(session.sessionId)}
                      className={`cursor-pointer hover:bg-slate-700/50 transition-colors ${getStatusColor(
                        session.status
                      )}`}
                    >
                      <td className="px-4 py-3 font-medium">{session.agentId}</td>
                      <td className="px-4 py-3 text-sm text-slate-400">
                        {formatTimestamp(session.startTs)}
                      </td>
                      <td className="px-4 py-3">{formatDuration(session.durationMs)}</td>
                      <td className="px-4 py-3 font-mono text-slate-300">{formatTokens(session.totalTokensIn)}</td>
                      <td className="px-4 py-3 font-mono text-slate-300">{formatTokens(session.totalTokensOut)}</td>
                      <td className="px-4 py-3 text-slate-300">{session.toolCalls}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block px-2 py-1 rounded text-xs font-medium ${getStatusColor(
                            session.status
                          )}`}
                        >
                          {session.status}
                        </span>
                      </td>
                      <td className={`px-4 py-3 ${session.errorCount > 0 ? 'text-red-400' : 'text-slate-400'}`}>{session.errorCount}</td>
                      <td className="px-4 py-3 text-slate-400">{session.spanCount}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="bg-slate-700 px-4 py-3 text-sm text-slate-300">
            Showing {sortedSessions.length} session{sortedSessions.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}
    </div>
  );
}
