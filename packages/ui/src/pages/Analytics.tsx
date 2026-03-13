/**
 * Cross-Session Analytics page
 *
 * Grid of 8 pre-built investigative queries with charts.
 * Each card shows a specific analytics view with drill-down to sessions.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { useAnalytics } from '../hooks/useAnalytics';
import QueryBuilder from '../components/QueryBuilder';
import type { AnalyticsParams } from '../api/client';

interface AnalyticsCardProps {
  title: string;
  description: string;
  queryType: string;
  params: AnalyticsParams;
  chartType: 'bar' | 'line' | 'stacked';
}

function AnalyticsCard({ title, description, queryType, params, chartType }: AnalyticsCardProps) {
  const navigate = useNavigate();
  const { data, loading, error } = useAnalytics(queryType, params);

  const handleDataPointClick = (dataPoint: any) => {
    // Navigate to session list filtered by this data point
    const filters: any = {};
    if (dataPoint.agentId) filters.agentId = dataPoint.agentId;
    if (dataPoint.channel) filters.channel = dataPoint.channel;
    if (dataPoint.model) filters.model = dataPoint.model;

    const queryString = new URLSearchParams(filters).toString();
    navigate(`/sessions${queryString ? `?${queryString}` : ''}`);
  };

  const renderChart = () => {
    if (!data || !data.data || data.data.length === 0) {
      return (
        <div
          style={{
            height: '200px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#999',
          }}
        >
          No data available
        </div>
      );
    }

    const chartData = data.data.map((item: any) => ({
      ...item,
      name: item.label || item.agentId || item.toolName || item.channel || item.bucket || item.spanType,
    }));

    const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

    if (chartType === 'bar') {
      return (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" fontSize={12} />
            <YAxis fontSize={12} />
            <Tooltip />
            <Legend />
            <Bar dataKey="value" fill="#2563eb" onClick={handleDataPointClick} cursor="pointer">
              {chartData.map((_entry: any, index: number) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      );
    }

    if (chartType === 'line') {
      return (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" fontSize={12} />
            <YAxis fontSize={12} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      );
    }

    // Stacked bar for multi-value data
    return (
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" fontSize={12} />
          <YAxis fontSize={12} />
          <Tooltip />
          <Legend />
          <Bar dataKey="value" fill="#2563eb" stackId="a" />
          {chartData[0]?.count !== undefined && <Bar dataKey="count" fill="#10b981" stackId="a" />}
        </BarChart>
      </ResponsiveContainer>
    );
  };

  return (
    <div
      style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        padding: '1.5rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      }}
    >
      <h3 style={{ marginBottom: '0.5rem', fontSize: '1.125rem', fontWeight: 600 }}>{title}</h3>
      <p style={{ color: '#666', fontSize: '0.875rem', marginBottom: '1rem' }}>{description}</p>

      {loading && (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>Loading...</div>
      )}

      {error && (
        <div
          style={{
            textAlign: 'center',
            padding: '2rem',
            color: '#ef4444',
            backgroundColor: '#fee',
            borderRadius: '4px',
          }}
        >
          Error: {error.message}
        </div>
      )}

      {!loading && !error && renderChart()}

      {!loading && !error && data && (
        <div style={{ marginTop: '1rem', fontSize: '0.75rem', color: '#666' }}>
          {data.data.length} result{data.data.length !== 1 ? 's' : ''}
          {data.metadata.fromTs && data.metadata.toTs && (
            <> • {new Date(data.metadata.fromTs).toLocaleDateString()} - {new Date(data.metadata.toTs).toLocaleDateString()}</>
          )}
        </div>
      )}
    </div>
  );
}

function Analytics() {
  const [params, setParams] = useState<AnalyticsParams>({
    fromTs: Date.now() - 7 * 24 * 60 * 60 * 1000,
    toTs: Date.now(),
  });

  return (
    <div>
      <h2 style={{ marginBottom: '0.5rem' }}>Cross-Session Analytics</h2>
      <p style={{ color: '#666', marginBottom: '1.5rem' }}>
        Answer investigative questions that cut across sessions: cost patterns, tool failures,
        retry clustering, and more.
      </p>

      <QueryBuilder onParamsChange={setParams} defaultTimeRange="week" />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))',
          gap: '1.5rem',
        }}
      >
        {/* Query 1: Cost by Agent + Model */}
        <AnalyticsCard
          title="Cost by Agent + Model"
          description="Which agent/model combo is burning money?"
          queryType="cost_by_agent_model"
          params={params}
          chartType="bar"
        />

        {/* Query 2: Cost per Successful Task */}
        <AnalyticsCard
          title="Cost per Successful Task"
          description="Am I paying more for worse results?"
          queryType="cost_per_successful_task"
          params={params}
          chartType="bar"
        />

        {/* Query 3: Tool Failure Rate */}
        <AnalyticsCard
          title="Tool Failure Rate"
          description="Which tool is the most unreliable?"
          queryType="tool_failure_rate"
          params={params}
          chartType="bar"
        />

        {/* Query 4: Retry Clustering */}
        <AnalyticsCard
          title="Retry Clustering"
          description="Where do retries concentrate? Same tool? Same agent?"
          queryType="retry_clustering"
          params={params}
          chartType="bar"
        />

        {/* Query 5: Latency Percentiles */}
        <AnalyticsCard
          title="Latency Percentiles by Span Type"
          description="Is my bottleneck LLM inference or tool execution?"
          queryType="latency_percentiles"
          params={params}
          chartType="stacked"
        />

        {/* Query 6: Session Duration Distribution */}
        <AnalyticsCard
          title="Session Duration Distribution"
          description="Are conversations getting longer over time?"
          queryType="session_duration_distribution"
          params={params}
          chartType="bar"
        />

        {/* Query 7: Error Hotspots by Channel */}
        <AnalyticsCard
          title="Error Hotspots by Channel"
          description="Is Telegram more error-prone than Slack?"
          queryType="error_hotspots_by_channel"
          params={params}
          chartType="bar"
        />

        {/* Query 8: Token Waste */}
        <AnalyticsCard
          title="Token Waste (Context Re-reads)"
          description="How much am I spending on re-reading history?"
          queryType="token_waste"
          params={params}
          chartType="bar"
        />
      </div>
    </div>
  );
}

export default Analytics;
