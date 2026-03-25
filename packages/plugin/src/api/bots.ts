/**
 * Bots API handler
 *
 * Returns per-agent overview data for the Bots dashboard.
 */

import type { SpanReader } from '../db/reader.js';
import type { OpenClawConfigReader } from '../config/openclaw-config.js';
import type { ApiResponse } from './sessions.js';
import { getAgentStats, getAgentSparklines, getAgentDelegations, type BotFilters } from '../db/bots-queries.js';

export interface BotInfo {
  id: string;
  name: string;
  emoji: string | null;
  status: 'working' | 'online' | 'idle' | 'offline';
  model: string | null;
  provider: string | null;
  channels: string[];
  sessionCount: number;
  messageCount: number;
  totalTokens: number;
  tokensIn: number;
  tokensOut: number;
  totalCost: number;
  errorCount: number;
  toolCalls: number;
  llmCalls: number;
  lastActiveTs: number | null;
  avgResponseMs: number | null;
  tokenSparkline: number[];
  responseSparkline: number[];
  delegatesTo: { agentId: string; count: number; failureCount: number }[];
  delegatedFrom: { agentId: string; count: number; failureCount: number }[];
}

const TWO_MINUTES = 2 * 60 * 1000;
const TEN_MINUTES = 10 * 60 * 1000;
const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

function computeStatus(lastActiveTs: number | null): BotInfo['status'] {
  if (lastActiveTs == null) return 'offline';
  const elapsed = Date.now() - lastActiveTs;
  if (elapsed < TWO_MINUTES) return 'working';
  if (elapsed < TEN_MINUTES) return 'online';
  if (elapsed < TWENTY_FOUR_HOURS) return 'idle';
  return 'offline';
}

function parseBotFilters(url: string): BotFilters {
  const filters: BotFilters = {};
  const qIdx = url.indexOf('?');
  if (qIdx === -1) return filters;
  const params = new URLSearchParams(url.slice(qIdx + 1));
  const fromTs = params.get('fromTs');
  if (fromTs) {
    const ts = parseInt(fromTs, 10);
    if (!isNaN(ts)) filters.fromTs = ts;
  }
  const toTs = params.get('toTs');
  if (toTs) {
    const ts = parseInt(toTs, 10);
    if (!isNaN(ts)) filters.toTs = ts;
  }
  return filters;
}

/**
 * Handle GET /clawlens/api/bots
 */
export function handleBots(
  url: string,
  reader: SpanReader,
  configReader: OpenClawConfigReader
): ApiResponse<BotInfo[]> {
  try {
    const filters = parseBotFilters(url);
    const agents = configReader.getAgents();
    if (agents.length === 0) {
      return { data: [] };
    }

    const agentIds = agents.map((a) => a.id);
    const db = reader.getDatabase();
    const statsMap = getAgentStats(db, agentIds, filters);
    const sparklinesMap = getAgentSparklines(db, agentIds, filters);
    const delegationsMap = getAgentDelegations(db, agentIds, filters);

    const bots: BotInfo[] = agents.map((agent) => {
      const stats = statsMap.get(agent.id);
      const sparkline = sparklinesMap.get(agent.id) ?? [];
      const delegations = delegationsMap.get(agent.id);

      const lastActiveTs = stats?.lastActiveTs ?? null;

      return {
        id: agent.id,
        name: agent.name,
        emoji: agent.emoji,
        status: computeStatus(lastActiveTs),
        model: agent.model,
        provider: agent.provider,
        channels: agent.channels,
        sessionCount: stats?.sessionCount ?? 0,
        messageCount: stats?.messageCount ?? 0,
        totalTokens: stats?.totalTokens ?? 0,
        tokensIn: stats?.tokensIn ?? 0,
        tokensOut: stats?.tokensOut ?? 0,
        totalCost: stats?.totalCost ?? 0,
        errorCount: stats?.errorCount ?? 0,
        toolCalls: stats?.toolCalls ?? 0,
        llmCalls: stats?.llmCalls ?? 0,
        lastActiveTs,
        avgResponseMs: stats?.avgResponseMs ?? null,
        tokenSparkline: sparkline.map((d) => d.tokens),
        responseSparkline: sparkline.map((d) => d.avgResponseMs ?? 0),
        delegatesTo: delegations?.delegatesTo ?? [],
        delegatedFrom: delegations?.delegatedFrom ?? [],
      };
    });

    return {
      data: bots,
      meta: { total: bots.length },
    };
  } catch (error) {
    return {
      data: [],
      error: {
        code: 'QUERY_ERROR',
        message: error instanceof Error ? error.message : 'Bots query failed',
      },
    };
  }
}
