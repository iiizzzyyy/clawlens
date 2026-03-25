/**
 * Query builder component for analytics
 *
 * Date range picker and filter controls shared across all queries.
 */

import { useState } from 'react';
import type { AnalyticsParams } from '../api/client';

export interface QueryBuilderProps {
  onParamsChange: (params: AnalyticsParams) => void;
  defaultTimeRange?: 'day' | 'week' | 'month' | 'all';
}

function QueryBuilder({ onParamsChange, defaultTimeRange = 'week' }: QueryBuilderProps) {
  const [timeRange, setTimeRange] = useState<'day' | 'week' | 'month' | 'all'>(defaultTimeRange);
  const [agentId, setAgentId] = useState('');
  const [channel, setChannel] = useState('');
  const [model, setModel] = useState('');

  const getTimestamps = (range: string) => {
    const now = Date.now();
    switch (range) {
      case 'day':
        return { fromTs: now - 24 * 60 * 60 * 1000, toTs: now };
      case 'week':
        return { fromTs: now - 7 * 24 * 60 * 60 * 1000, toTs: now };
      case 'month':
        return { fromTs: now - 30 * 24 * 60 * 60 * 1000, toTs: now };
      default:
        return {};
    }
  };

  const handleApply = () => {
    const params: AnalyticsParams = {
      ...getTimestamps(timeRange),
    };

    if (agentId) params.agentId = agentId;
    if (channel) params.channel = channel;
    if (model) params.model = model;

    onParamsChange(params);
  };

  return (
    <div className="flex gap-4 p-4 bg-slate-800 rounded-lg mb-6 items-end flex-wrap border border-slate-700">
      {/* Time Range */}
      <div className="min-w-[150px]">
        <label className="block text-sm text-slate-300 mb-2">
          Time Range
        </label>
        <select
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value as 'day' | 'week' | 'month' | 'all')}
          className="w-full p-2 rounded bg-slate-900 border border-slate-600 text-slate-100 focus:outline-none focus:ring-2 focus:ring-accent-500"
        >
          <option value="day">Last 24 hours</option>
          <option value="week">Last 7 days</option>
          <option value="month">Last 30 days</option>
          <option value="all">All time</option>
        </select>
      </div>

      {/* Agent Filter */}
      <div className="min-w-[150px]">
        <label className="block text-sm text-slate-300 mb-2">
          Agent ID (optional)
        </label>
        <input
          type="text"
          value={agentId}
          onChange={(e) => setAgentId(e.target.value)}
          placeholder="Filter by agent"
          className="w-full p-2 rounded bg-slate-900 border border-slate-600 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-accent-500"
        />
      </div>

      {/* Channel Filter */}
      <div className="min-w-[150px]">
        <label className="block text-sm text-slate-300 mb-2">
          Channel (optional)
        </label>
        <input
          type="text"
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          placeholder="e.g., slack, telegram"
          className="w-full p-2 rounded bg-slate-900 border border-slate-600 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-accent-500"
        />
      </div>

      {/* Model Filter */}
      <div className="min-w-[150px]">
        <label className="block text-sm text-slate-300 mb-2">
          Model (optional)
        </label>
        <input
          type="text"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="e.g., claude-sonnet-4"
          className="w-full p-2 rounded bg-slate-900 border border-slate-600 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-accent-500"
        />
      </div>

      {/* Apply Button */}
      <button
        onClick={handleApply}
        className="px-6 py-2 bg-accent-500 hover:bg-accent-600 text-white rounded font-medium cursor-pointer transition-colors"
      >
        Apply Filters
      </button>
    </div>
  );
}

export default QueryBuilder;
