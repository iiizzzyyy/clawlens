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
  valueField: string;
  secondaryValueField?: string;
}

function AnalyticsCard({ title, description, queryType, params, chartType, valueField, secondaryValueField }: AnalyticsCardProps) {
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
        <div className="h-[200px] flex items-center justify-center text-slate-500">
          No data available
        </div>
      );
    }

    const chartData = data.data.map((item: any) => ({
      ...item,
      name: item.label || item.agentId || item.toolName || item.channel || item.bucket || item.spanType,
      value: item[valueField],
      ...(secondaryValueField ? { count: item[secondaryValueField] } : {}),
    }));

    const COLORS = ['#ff5c5c', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

    if (chartType === 'bar') {
      return (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e2028" />
            <XAxis dataKey="name" fontSize={12} stroke="#8e8e93" />
            <YAxis fontSize={12} stroke="#8e8e93" />
            <Tooltip contentStyle={{ backgroundColor: '#161920', border: '1px solid #1e2028', color: '#d4d4d8' }} />
            <Legend />
            <Bar dataKey="value" fill="#ff5c5c" onClick={handleDataPointClick} cursor="pointer">
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
            <CartesianGrid strokeDasharray="3 3" stroke="#1e2028" />
            <XAxis dataKey="name" fontSize={12} stroke="#8e8e93" />
            <YAxis fontSize={12} stroke="#8e8e93" />
            <Tooltip contentStyle={{ backgroundColor: '#161920', border: '1px solid #1e2028', color: '#d4d4d8' }} />
            <Legend />
            <Line type="monotone" dataKey="value" stroke="#ff5c5c" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      );
    }

    // Stacked bar for multi-value data
    return (
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e2028" />
          <XAxis dataKey="name" fontSize={12} stroke="#8e8e93" />
          <YAxis fontSize={12} stroke="#8e8e93" />
          <Tooltip contentStyle={{ backgroundColor: '#161920', border: '1px solid #1e2028', color: '#d4d4d8' }} />
          <Legend />
          <Bar dataKey="value" fill="#ff5c5c" stackId="a" />
          {chartData[0]?.count !== undefined && <Bar dataKey="count" fill="#10b981" stackId="a" />}
        </BarChart>
      </ResponsiveContainer>
    );
  };

  return (
    <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
      <h3 className="mb-2 text-lg font-semibold text-white">{title}</h3>
      <p className="text-slate-400 text-sm mb-4">{description}</p>

      {loading && (
        <div className="text-center py-8 text-slate-400">Loading...</div>
      )}

      {error && (
        <div className="text-center py-8 text-red-400 bg-red-900/20 rounded">
          Error: {error.message}
        </div>
      )}

      {!loading && !error && renderChart()}

      {!loading && !error && data && (
        <div className="mt-4 text-xs text-slate-500">
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
      <h2 className="text-2xl font-bold text-white mb-2">Cross-Session Analytics</h2>
      <p className="text-slate-400 mb-6">
        Answer investigative questions that cut across sessions: cost patterns, tool failures,
        retry clustering, and more.
      </p>

      <QueryBuilder onParamsChange={setParams} defaultTimeRange="week" />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(500px,1fr))] gap-6">
        {/* Query 1: Cost by Agent + Model */}
        <AnalyticsCard
          title="Cost by Agent + Model"
          description="Which agent/model combo is burning money?"
          queryType="cost_by_agent_model"
          params={params}
          chartType="bar"
          valueField="totalCost"
        />

        {/* Query 2: Cost per Successful Task */}
        <AnalyticsCard
          title="Cost per Successful Task"
          description="Am I paying more for worse results?"
          queryType="cost_per_successful_task"
          params={params}
          chartType="bar"
          valueField="costPerTask"
        />

        {/* Query 3: Tool Failure Rate */}
        <AnalyticsCard
          title="Tool Failure Rate"
          description="Which tool is the most unreliable?"
          queryType="tool_failure_rate"
          params={params}
          chartType="bar"
          valueField="failureRate"
        />

        {/* Query 4: Retry Clustering */}
        <AnalyticsCard
          title="Retry Clustering"
          description="Where do retries concentrate? Same tool? Same agent?"
          queryType="retry_clustering"
          params={params}
          chartType="bar"
          valueField="retryCount"
        />

        {/* Query 5: Latency Percentiles */}
        <AnalyticsCard
          title="Latency Percentiles by Span Type"
          description="Is my bottleneck LLM inference or tool execution?"
          queryType="latency_percentiles"
          params={params}
          chartType="stacked"
          valueField="p90"
          secondaryValueField="count"
        />

        {/* Query 6: Session Duration Distribution */}
        <AnalyticsCard
          title="Session Duration Distribution"
          description="Are conversations getting longer over time?"
          queryType="session_duration_distribution"
          params={params}
          chartType="bar"
          valueField="count"
        />

        {/* Query 7: Error Hotspots by Channel */}
        <AnalyticsCard
          title="Error Hotspots by Channel"
          description="Is Telegram more error-prone than Slack?"
          queryType="error_hotspots_by_channel"
          params={params}
          chartType="bar"
          valueField="errorRate"
        />

        {/* Query 8: Token Waste */}
        <AnalyticsCard
          title="Token Waste (Context Re-reads)"
          description="How much am I spending on re-reading history?"
          queryType="token_waste"
          params={params}
          chartType="bar"
          valueField="rereadTokens"
        />
      </div>
    </div>
  );
}

export default Analytics;
