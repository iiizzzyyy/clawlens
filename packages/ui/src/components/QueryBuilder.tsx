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
    <div
      style={{
        display: 'flex',
        gap: '1rem',
        padding: '1rem',
        backgroundColor: 'white',
        borderRadius: '8px',
        marginBottom: '1.5rem',
        alignItems: 'flex-end',
        flexWrap: 'wrap',
      }}
    >
      {/* Time Range */}
      <div style={{ minWidth: '150px' }}>
        <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
          Time Range
        </label>
        <select
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value as 'day' | 'week' | 'month' | 'all')}
          style={{
            width: '100%',
            padding: '0.5rem',
            borderRadius: '4px',
            border: '1px solid #ddd',
          }}
        >
          <option value="day">Last 24 hours</option>
          <option value="week">Last 7 days</option>
          <option value="month">Last 30 days</option>
          <option value="all">All time</option>
        </select>
      </div>

      {/* Agent Filter */}
      <div style={{ minWidth: '150px' }}>
        <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
          Agent ID (optional)
        </label>
        <input
          type="text"
          value={agentId}
          onChange={(e) => setAgentId(e.target.value)}
          placeholder="Filter by agent"
          style={{
            width: '100%',
            padding: '0.5rem',
            borderRadius: '4px',
            border: '1px solid #ddd',
          }}
        />
      </div>

      {/* Channel Filter */}
      <div style={{ minWidth: '150px' }}>
        <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
          Channel (optional)
        </label>
        <input
          type="text"
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          placeholder="e.g., slack, telegram"
          style={{
            width: '100%',
            padding: '0.5rem',
            borderRadius: '4px',
            border: '1px solid #ddd',
          }}
        />
      </div>

      {/* Model Filter */}
      <div style={{ minWidth: '150px' }}>
        <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
          Model (optional)
        </label>
        <input
          type="text"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="e.g., claude-sonnet-4"
          style={{
            width: '100%',
            padding: '0.5rem',
            borderRadius: '4px',
            border: '1px solid #ddd',
          }}
        />
      </div>

      {/* Apply Button */}
      <button
        onClick={handleApply}
        style={{
          padding: '0.5rem 1.5rem',
          backgroundColor: '#2563eb',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontWeight: 500,
        }}
      >
        Apply Filters
      </button>
    </div>
  );
}

export default QueryBuilder;
