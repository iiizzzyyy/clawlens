/**
 * Scheduled Jobs dashboard page
 *
 * Summary strip + sortable table with row expansion for run history.
 */

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCronJobs, useCronJobRuns } from '../hooks/useCronJobs';
import { formatSchedule } from '../utils/schedule-human';
import type { CronJob } from '../api/client';

const POLL_OPTIONS = [
  { label: 'Manual', value: null },
  { label: '30s', value: 30_000 },
  { label: '1m', value: 60_000 },
  { label: '5m', value: 300_000 },
] as const;

type SortField = 'name' | 'agentId' | 'schedule' | 'lastRun' | 'duration' | 'cost' | 'tokens' | 'tokensIn' | 'tokensOut' | 'status';
type SortDir = 'asc' | 'desc';
type StatusFilter = 'all' | 'ok' | 'failing' | 'disabled';

function formatRelativeTime(ms: number | undefined): string {
  if (!ms) return '--';
  const diff = Date.now() - ms;
  if (diff < 0) return formatCountdown(-diff);
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function formatCountdown(ms: number): string {
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} min`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`;
  return `${Math.floor(ms / 86_400_000)}d`;
}

function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return '--';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function formatCost(usd: number | null | undefined): string {
  if (usd == null) return '--';
  return `$${usd.toFixed(2)}`;
}

function formatTokens(n: number | null | undefined): string {
  if (n == null) return '--';
  if (n === 0) return '0';
  if (n < 1_000) return String(n);
  if (n < 1_000_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

function getJobStatus(job: CronJob): string {
  if (!job.enabled) return 'OFF';
  const errs = job.state.consecutiveErrors ?? 0;
  if (errs > 0) return `ERR x${errs}`;
  return 'OK';
}

function getStatusColor(status: string): string {
  if (status === 'OK') return 'bg-emerald-900/60 text-emerald-400';
  if (status === 'OFF') return 'bg-slate-700/60 text-slate-400';
  return 'bg-red-900/60 text-red-400';
}

export default function CronJobs() {
  const [pollInterval, setPollInterval] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [agentFilter, setAgentFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  const { jobs, summary, loading, error, refetch, lastUpdated } = useCronJobs(pollInterval);
  const navigate = useNavigate();

  // Unique agent IDs for filter dropdown
  const agentIds = useMemo(
    () => [...new Set(jobs.map((j) => j.agentId))].sort(),
    [jobs]
  );

  // Filter + sort
  const filteredJobs = useMemo(() => {
    let result = jobs;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (j) => j.name.toLowerCase().includes(q) || j.id.toLowerCase().includes(q)
      );
    }

    if (agentFilter) {
      result = result.filter((j) => j.agentId === agentFilter);
    }

    if (statusFilter !== 'all') {
      result = result.filter((j) => {
        if (statusFilter === 'ok') return j.enabled && (j.state.consecutiveErrors ?? 0) === 0;
        if (statusFilter === 'failing') return j.enabled && (j.state.consecutiveErrors ?? 0) > 0;
        if (statusFilter === 'disabled') return !j.enabled;
        return true;
      });
    }

    result = [...result].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name':
          cmp = a.name.localeCompare(b.name);
          break;
        case 'agentId':
          cmp = a.agentId.localeCompare(b.agentId);
          break;
        case 'schedule':
          cmp = formatSchedule(a.schedule).localeCompare(formatSchedule(b.schedule));
          break;
        case 'lastRun':
          cmp = (a.state.lastRunAtMs ?? 0) - (b.state.lastRunAtMs ?? 0);
          break;
        case 'duration':
          cmp = (a.avgDurationMs ?? 0) - (b.avgDurationMs ?? 0);
          break;
        case 'cost':
          cmp = (a.lastRunCostUsd ?? 0) - (b.lastRunCostUsd ?? 0);
          break;
        case 'tokens':
          cmp = ((a.tokensIn ?? 0) + (a.tokensOut ?? 0)) - ((b.tokensIn ?? 0) + (b.tokensOut ?? 0));
          break;
        case 'tokensIn':
          cmp = (a.tokensIn ?? 0) - (b.tokensIn ?? 0);
          break;
        case 'tokensOut':
          cmp = (a.tokensOut ?? 0) - (b.tokensOut ?? 0);
          break;
        case 'status': {
          const sa = getJobStatus(a);
          const sb = getJobStatus(b);
          cmp = sa.localeCompare(sb);
          break;
        }
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [jobs, searchQuery, agentFilter, statusFilter, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-100">Scheduled Jobs</h1>
        <div className="flex items-center gap-4">
          {lastUpdated && (
            <span className="text-xs text-slate-500">
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={refetch}
            className="px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-md transition-colors"
          >
            Refresh
          </button>
          <div className="flex items-center gap-1 bg-slate-800 rounded-md p-0.5">
            {POLL_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                onClick={() => setPollInterval(opt.value)}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  pollInterval === opt.value
                    ? 'bg-slate-600 text-slate-100'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 text-red-400 text-sm">
          {error.message}
        </div>
      )}

      {/* Summary strip */}
      {summary && <SummaryStrip summary={summary} />}

      {/* Filters */}
      <div className="flex items-center gap-4">
        <input
          type="text"
          placeholder="Search jobs..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="px-3 py-1.5 text-sm bg-slate-800 border border-slate-700 rounded-md text-slate-200 placeholder-slate-500 focus:outline-none focus:border-slate-500 w-64"
        />
        <select
          value={agentFilter}
          onChange={(e) => setAgentFilter(e.target.value)}
          className="px-3 py-1.5 text-sm bg-slate-800 border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:border-slate-500"
        >
          <option value="">All Agents</option>
          {agentIds.map((id) => (
            <option key={id} value={id}>{id}</option>
          ))}
        </select>
        <div className="flex items-center gap-1 bg-slate-800 rounded-md p-0.5">
          {(['all', 'ok', 'failing', 'disabled'] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-2 py-1 text-xs rounded capitalize transition-colors ${
                statusFilter === s
                  ? 'bg-slate-600 text-slate-100'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-500 ml-auto">
          {filteredJobs.length} of {jobs.length} jobs
        </span>
      </div>

      {/* Loading */}
      {loading && jobs.length === 0 && (
        <div className="text-center py-12 text-slate-500">Loading cron jobs...</div>
      )}

      {/* Table */}
      {filteredJobs.length > 0 && (
        <div className="bg-slate-800/50 rounded-lg overflow-hidden border border-slate-700/50">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-700/50 text-slate-400 text-left">
                <Th field="name" label="Job" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <Th field="agentId" label="Agent" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <Th field="schedule" label="Schedule" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <Th field="lastRun" label="Last Run" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <Th field="duration" label="Duration" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <Th field="cost" label="Cost" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <Th field="tokens" label="Tokens" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <Th field="tokensIn" label="Tokens In" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <Th field="tokensOut" label="Tokens Out" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <Th field="status" label="Status" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider">History</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/30">
              {filteredJobs.map((job) => (
                <JobRow
                  key={job.id}
                  job={job}
                  expanded={expandedJobId === job.id}
                  onToggle={() => setExpandedJobId(expandedJobId === job.id ? null : job.id)}
                  onNavigateToSession={(sid) => navigate(`/replay/${sid}`)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && filteredJobs.length === 0 && jobs.length > 0 && (
        <div className="text-center py-12 text-slate-500">No jobs match your filters</div>
      )}
    </div>
  );
}

// ── Summary Strip ──

function SummaryStrip({ summary }: { summary: import('../api/client').CronSummary }) {
  const nextRunIn = summary.nextRunAtMs ? summary.nextRunAtMs - Date.now() : null;

  return (
    <div className="grid grid-cols-4 gap-4">
      <StatCard label="Active Jobs" value={summary.activeCount} sub={`of ${summary.totalCount} total`} />
      <StatCard
        label="Failing"
        value={summary.failingCount}
        sub="consecutive errors"
        alert={summary.failingCount > 0}
      />
      <StatCard
        label="Next Run"
        value={nextRunIn != null && nextRunIn > 0 ? formatCountdown(nextRunIn) : '--'}
        sub={summary.nextRunJobName || '--'}
        small
      />
      <StatCard
        label="Est. Daily Cost"
        value={summary.estimatedDailyCostUsd != null ? `$${summary.estimatedDailyCostUsd.toFixed(2)}` : '--'}
        sub="across all jobs"
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  alert,
  small,
}: {
  label: string;
  value: string | number;
  sub: string;
  alert?: boolean;
  small?: boolean;
}) {
  return (
    <div
      className={`bg-slate-800 border rounded-lg p-4 text-center ${
        alert ? 'border-red-800' : 'border-slate-700'
      }`}
    >
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div
        className={`font-bold ${alert ? 'text-red-400' : 'text-slate-100'} ${
          small ? 'text-lg' : 'text-2xl'
        }`}
      >
        {value}
      </div>
      <div className={`text-[10px] mt-0.5 ${alert ? 'text-red-400' : 'text-slate-500'}`}>{sub}</div>
    </div>
  );
}

// ── Sortable table header ──

function Th({
  field,
  label,
  sortField,
  sortDir,
  onSort,
}: {
  field: SortField;
  label: string;
  sortField: SortField;
  sortDir: SortDir;
  onSort: (f: SortField) => void;
}) {
  return (
    <th
      className="px-4 py-3 text-xs font-medium uppercase tracking-wider cursor-pointer hover:text-slate-200 select-none"
      onClick={() => onSort(field)}
    >
      {label}
      <span className="text-slate-600">
        {sortField === field ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'}
      </span>
    </th>
  );
}

// ── Job row ──

function JobRow({
  job,
  expanded,
  onToggle,
  onNavigateToSession,
}: {
  job: CronJob;
  expanded: boolean;
  onToggle: () => void;
  onNavigateToSession: (sessionId: string) => void;
}) {
  const status = getJobStatus(job);
  const isFailing = job.enabled && (job.state.consecutiveErrors ?? 0) > 0;
  const isDisabled = !job.enabled;

  return (
    <>
      <tr
        className={`cursor-pointer transition-colors hover:bg-slate-700/30 ${
          isFailing ? 'bg-red-900/[0.15]' : ''
        } ${isDisabled ? 'opacity-50' : ''}`}
        onClick={onToggle}
      >
        <td className="px-4 py-3 font-medium text-slate-200">{job.name}</td>
        <td className="px-4 py-3 text-slate-500">{job.agentId}</td>
        <td className="px-4 py-3 text-slate-400 font-mono text-xs">
          {formatSchedule(job.schedule)}
        </td>
        <td className="px-4 py-3 text-slate-400">{formatRelativeTime(job.state.lastRunAtMs)}</td>
        <td className="px-4 py-3 text-slate-400">{formatDuration(job.avgDurationMs)}</td>
        <td className="px-4 py-3 text-slate-400">{formatCost(job.lastRunCostUsd)}</td>
        <td className="px-4 py-3 text-slate-400">{formatTokens(job.tokensIn != null && job.tokensOut != null ? job.tokensIn + job.tokensOut : null)}</td>
        <td className="px-4 py-3 text-slate-400">{formatTokens(job.tokensIn)}</td>
        <td className="px-4 py-3 text-slate-400">{formatTokens(job.tokensOut)}</td>
        <td className="px-4 py-3">
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(status)}`}>
            {status}
          </span>
        </td>
        <td className="px-4 py-3">
          <div className="flex gap-0.5">
            {job.recentRuns.map((run, i) => (
              <span
                key={i}
                className={`w-2 h-2 rounded-full ${
                  run.status === 'ok' || run.status === 'finished'
                    ? 'bg-emerald-500'
                    : 'bg-red-500'
                }`}
                title={`${run.status} — ${new Date(run.ts).toLocaleString()}`}
              />
            ))}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={11} className="p-0">
            <ExpandedJobDetail job={job} onNavigateToSession={onNavigateToSession} />
          </td>
        </tr>
      )}
    </>
  );
}

// ── Expanded row detail ──

function ExpandedJobDetail({
  job,
  onNavigateToSession,
}: {
  job: CronJob;
  onNavigateToSession: (sessionId: string) => void;
}) {
  const { runs, loading, error } = useCronJobRuns(job.id);

  return (
    <div className="bg-slate-800/80 border-t border-slate-700/50 px-6 py-4 space-y-4">
      {/* Job metadata */}
      <div className="grid grid-cols-3 gap-4 text-sm">
        <div>
          <span className="text-slate-500">Schedule: </span>
          <span className="text-slate-300 font-mono text-xs">
            {job.schedule.kind === 'cron' && job.schedule.expr}
            {job.schedule.kind === 'at' && job.schedule.at}
            {job.schedule.kind === 'every' && `${job.schedule.everyMs}ms`}
          </span>
        </div>
        <div>
          <span className="text-slate-500">Total runs: </span>
          <span className="text-slate-300">{job.totalRuns}</span>
        </div>
        <div>
          <span className="text-slate-500">Errors: </span>
          <span className={job.errorCount > 0 ? 'text-red-400' : 'text-slate-300'}>
            {job.errorCount}
          </span>
        </div>
        {job.description && (
          <div className="col-span-3">
            <span className="text-slate-500">Description: </span>
            <span className="text-slate-300">{job.description}</span>
          </div>
        )}
        {job.state.lastError && (
          <div className="col-span-3">
            <span className="text-slate-500">Last error: </span>
            <span className="text-red-400 text-xs">{job.state.lastError}</span>
          </div>
        )}
      </div>

      {/* Run history mini-table */}
      {loading && <div className="text-slate-500 text-sm">Loading runs...</div>}
      {error && <div className="text-red-400 text-sm">{error.message}</div>}
      {runs.length > 0 && (
        <div className="overflow-hidden rounded border border-slate-700/50">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-700/30 text-slate-500">
                <th className="px-3 py-2 text-left">Timestamp</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Duration</th>
                <th className="px-3 py-2 text-left">Cost</th>
                <th className="px-3 py-2 text-left">Tokens</th>
                <th className="px-3 py-2 text-left">Tokens In</th>
                <th className="px-3 py-2 text-left">Tokens Out</th>
                <th className="px-3 py-2 text-left">Summary</th>
                <th className="px-3 py-2 text-left">Session</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/20">
              {runs.map((run, i) => (
                <tr key={i} className="text-slate-400">
                  <td className="px-3 py-2">
                    {new Date(run.runAtMs ?? run.ts).toLocaleString()}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        run.status === 'ok'
                          ? 'bg-emerald-900/60 text-emerald-400'
                          : 'bg-red-900/60 text-red-400'
                      }`}
                    >
                      {run.status || '--'}
                    </span>
                  </td>
                  <td className="px-3 py-2">{formatDuration(run.durationMs)}</td>
                  <td className="px-3 py-2">{formatCost(run.costUsd)}</td>
                  <td className="px-3 py-2">{formatTokens(run.tokensIn != null && run.tokensOut != null ? run.tokensIn + run.tokensOut : null)}</td>
                  <td className="px-3 py-2">{formatTokens(run.tokensIn)}</td>
                  <td className="px-3 py-2">{formatTokens(run.tokensOut)}</td>
                  <td className="px-3 py-2 max-w-xs truncate" title={run.summary || ''}>
                    {run.summary ? run.summary.slice(0, 80) + (run.summary.length > 80 ? '...' : '') : '--'}
                  </td>
                  <td className="px-3 py-2">
                    {run.sessionId ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onNavigateToSession(run.sessionId!);
                        }}
                        className="text-blue-400 hover:text-blue-300 underline"
                      >
                        View
                      </button>
                    ) : (
                      <span className="text-slate-600">--</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
