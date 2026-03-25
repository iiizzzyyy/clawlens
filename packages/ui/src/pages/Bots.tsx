/**
 * Bots dashboard page
 *
 * Displays agent cards with stats, sparklines, and live status.
 */

import { useState, useMemo } from 'react';
import { useBots } from '../hooks/useBots';
import type { BotFilters } from '../hooks/useBots';
import AgentCard from '../components/AgentCard';

const POLL_OPTIONS = [
  { label: 'Manual', value: null },
  { label: '30s', value: 30_000 },
  { label: '1m', value: 60_000 },
  { label: '5m', value: 300_000 },
] as const;

type PeriodKey = '24h' | '7d' | '30d' | 'all';

const PERIOD_OPTIONS: { key: PeriodKey; label: string; ms: number | null }[] = [
  { key: '24h', label: '24h', ms: 24 * 60 * 60 * 1000 },
  { key: '7d', label: '7d', ms: 7 * 24 * 60 * 60 * 1000 },
  { key: '30d', label: '30d', ms: 30 * 24 * 60 * 60 * 1000 },
  { key: 'all', label: 'All', ms: null },
];

function formatTime(date: Date | null): string {
  if (!date) return '--:--:--';
  return date.toLocaleTimeString();
}

export default function Bots() {
  const [pollInterval, setPollInterval] = useState<number | null>(null);
  const [period, setPeriod] = useState<PeriodKey>('all');

  const filters = useMemo<BotFilters | undefined>(() => {
    const opt = PERIOD_OPTIONS.find((p) => p.key === period);
    if (!opt?.ms) return undefined;
    const now = Date.now();
    return { fromTs: now - opt.ms, toTs: now };
  }, [period]);

  const { bots, loading, error, refetch, lastUpdated } = useBots(pollInterval, filters);

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Bots</h1>
          <p className="text-sm text-slate-400 mt-1">
            {bots.length} agent{bots.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3">
          {/* Period selector */}
          <div className="flex rounded-md overflow-hidden border border-slate-600">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setPeriod(opt.key)}
                className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                  period === opt.key
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Poll interval selector */}
          <select
            value={pollInterval ?? ''}
            onChange={(e) => setPollInterval(e.target.value ? Number(e.target.value) : null)}
            className="bg-slate-700 text-slate-200 text-sm rounded px-2 py-1.5 border border-slate-600 focus:outline-none focus:border-blue-500"
          >
            {POLL_OPTIONS.map((opt) => (
              <option key={opt.label} value={opt.value ?? ''}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* Refresh button */}
          <button
            onClick={refetch}
            disabled={loading}
            className="px-3 py-1.5 text-sm bg-slate-700 text-slate-200 rounded border border-slate-600 hover:bg-slate-600 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>

          {/* Updated at */}
          <span className="text-xs text-slate-500">
            Updated at {formatTime(lastUpdated)}
          </span>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-sm">
          {error.message}
        </div>
      )}

      {/* Loading state (first load only) */}
      {loading && bots.length === 0 && !error && (
        <div className="text-center text-slate-400 py-12">Loading bots...</div>
      )}

      {/* Bot Cards Grid */}
      {bots.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {bots.map((bot) => (
            <AgentCard key={bot.id} bot={bot} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && bots.length === 0 && (
        <div className="text-center text-slate-400 py-12">
          No agents found. Check that openclaw.json has an agents.list configuration.
        </div>
      )}
    </div>
  );
}
