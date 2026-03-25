/**
 * Agent card component for the Bots dashboard
 */

import { Link } from 'react-router-dom';
import type { BotInfo, DelegationEntry } from '../api/client';
import Sparkline from './Sparkline';

interface AgentCardProps {
  bot: BotInfo;
}

const STATUS_CONFIG = {
  working: { label: 'Working', color: 'bg-green-500', pulse: true },
  online: { label: 'Online', color: 'bg-green-500', pulse: false },
  idle: { label: 'Idle', color: 'bg-yellow-500', pulse: false },
  offline: { label: 'Offline', color: 'bg-slate-500', pulse: false },
};

function formatRelativeTime(ts: number | null): string {
  if (ts == null) return 'Never';
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatMs(ms: number | null): string {
  if (ms == null) return '--';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatCost(usd: number): string {
  if (usd === 0) return '$0';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(2)}`;
  return `$${usd.toFixed(2)}`;
}

function getErrorRateColor(errorCount: number, totalSpans: number): string {
  if (totalSpans === 0 || errorCount === 0) return 'text-green-400';
  const rate = errorCount / totalSpans;
  if (rate > 0.2) return 'text-red-400';
  if (rate > 0.05) return 'text-yellow-400';
  return 'text-green-400';
}

function getDelegationStatus(entry: DelegationEntry): { icon: string; color: string } {
  if (entry.count === 0) return { icon: '--', color: 'text-slate-500' };
  const failRate = entry.failureCount / entry.count;
  if (failRate > 0.3) return { icon: '✗', color: 'text-red-400' };
  if (failRate > 0.1) return { icon: '!', color: 'text-yellow-400' };
  return { icon: '✓', color: 'text-green-400' };
}

function getTrendArrow(sparkline: number[]): { arrow: string; color: string } | null {
  if (sparkline.length < 2) return null;
  const recent = sparkline[sparkline.length - 1];
  const prev = sparkline[sparkline.length - 2];
  if (prev === 0 && recent === 0) return null;
  if (recent > prev) return { arrow: '\u2191', color: 'text-red-400' };
  if (recent < prev) return { arrow: '\u2193', color: 'text-green-400' };
  return { arrow: '\u2192', color: 'text-slate-400' };
}

export default function AgentCard({ bot }: AgentCardProps) {
  const statusCfg = STATUS_CONFIG[bot.status];
  const responseTrend = getTrendArrow(bot.responseSparkline);

  return (
    <div className="bg-slate-800 rounded-lg p-5 border border-slate-700 flex flex-col gap-4">
      {/* Header: Name + Status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">{bot.emoji || '🤖'}</span>
          <h3 className="text-lg font-semibold text-white">{bot.name}</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={`w-2.5 h-2.5 rounded-full ${statusCfg.color} ${statusCfg.pulse ? 'animate-pulse' : ''}`}
          />
          <span className="text-xs text-slate-400">{statusCfg.label}</span>
        </div>
      </div>

      {/* Agent ID */}
      <div>
        <span className="text-xs text-slate-500">Agent ID</span>
        <div>
          <Link
            to={`/?agentId=${bot.id}`}
            className="font-mono text-sm text-blue-400 hover:text-blue-300"
          >
            {bot.id}
          </Link>
        </div>
      </div>

      {/* Model */}
      {bot.model && (
        <div>
          <span className="text-xs text-slate-500">Model</span>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-sm text-slate-200 truncate">{bot.model}</span>
          </div>
        </div>
      )}

      {/* Channels */}
      {bot.channels.length > 0 && (
        <div>
          <span className="text-xs text-slate-500">Channels</span>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {bot.channels.map((ch) => (
              <span
                key={ch}
                className="px-2 py-0.5 text-xs rounded-full bg-slate-700 text-slate-300 capitalize"
              >
                {ch}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className="text-xs text-slate-500">Sessions</span>
          <div className="text-sm font-medium text-slate-200">{bot.sessionCount.toLocaleString()}</div>
        </div>
        <div>
          <span className="text-xs text-slate-500">Messages</span>
          <div className="text-sm font-medium text-slate-200">{bot.messageCount.toLocaleString()}</div>
        </div>
        <div>
          <span className="text-xs text-slate-500">Tool Calls</span>
          <div className="text-sm font-medium text-slate-200">{bot.toolCalls.toLocaleString()}</div>
        </div>
        <div>
          <span className="text-xs text-slate-500">LLM Calls</span>
          <div className="text-sm font-medium text-slate-200">{bot.llmCalls.toLocaleString()}</div>
        </div>
      </div>

      {/* Tokens: In / Out + Sparkline */}
      <div>
        <div className="grid grid-cols-2 gap-3 mb-1">
          <div>
            <span className="text-xs text-slate-500">Tokens In</span>
            <div className="text-sm font-medium text-slate-200">{formatTokens(bot.tokensIn)}</div>
          </div>
          <div>
            <span className="text-xs text-slate-500">Tokens Out</span>
            <div className="text-sm font-medium text-slate-200">{formatTokens(bot.tokensOut)}</div>
          </div>
        </div>
        <Sparkline data={bot.tokenSparkline} color="#10b981" height={28} />
      </div>

      {/* Cost + Errors row */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className="text-xs text-slate-500">Total Cost</span>
          <div className="text-sm font-medium text-slate-200">{formatCost(bot.totalCost)}</div>
        </div>
        <div>
          <span className="text-xs text-slate-500">Errors</span>
          <div className={`text-sm font-medium ${getErrorRateColor(bot.errorCount, bot.sessionCount)}`}>
            {bot.errorCount.toLocaleString()}
            {bot.sessionCount > 0 && (
              <span className="text-xs text-slate-500 ml-1">
                ({((bot.errorCount / bot.sessionCount) * 100).toFixed(0)}%)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Last Active */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">Last Active</span>
        <span className="text-sm text-slate-300">{formatRelativeTime(bot.lastActiveTs)}</span>
      </div>

      {/* Avg Response + Sparkline */}
      <div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">Avg Response</span>
          <div className="flex items-center gap-1">
            <span className="text-sm font-medium text-slate-200">{formatMs(bot.avgResponseMs)}</span>
            {responseTrend && (
              <span className={`text-xs ${responseTrend.color}`}>{responseTrend.arrow}</span>
            )}
          </div>
        </div>
        <div className="mt-1">
          <Sparkline data={bot.responseSparkline} color="#f59e0b" height={28} />
        </div>
      </div>

      {/* Delegations */}
      {(bot.delegatesTo.length > 0 || bot.delegatedFrom.length > 0) && (
        <div className="border-t border-slate-700 pt-3">
          {bot.delegatesTo.length > 0 && (
            <div className="mb-2">
              <span className="text-xs text-slate-500">Delegates To</span>
              <div className="mt-1 space-y-1">
                {bot.delegatesTo.map((d) => {
                  const status = getDelegationStatus(d);
                  return (
                    <div key={d.agentId} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-500">→</span>
                        <Link
                          to={`/?agentId=${d.agentId}`}
                          className="text-blue-400 hover:text-blue-300"
                        >
                          {d.agentId}
                        </Link>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400">×{d.count}</span>
                        <span className={status.color}>{status.icon}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {bot.delegatedFrom.length > 0 && (
            <div>
              <span className="text-xs text-slate-500">Receives From</span>
              <div className="mt-1 space-y-1">
                {bot.delegatedFrom.map((d) => {
                  const status = getDelegationStatus(d);
                  return (
                    <div key={d.agentId} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-500">←</span>
                        <Link
                          to={`/?agentId=${d.agentId}`}
                          className="text-blue-400 hover:text-blue-300"
                        >
                          {d.agentId}
                        </Link>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400">×{d.count}</span>
                        <span className={status.color}>{status.icon}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
