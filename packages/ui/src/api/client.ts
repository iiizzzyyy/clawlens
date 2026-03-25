/**
 * Typed API client for ClawLens backend
 */

// =============================================================================
// Types (matching plugin API types)
// =============================================================================

export type SpanType = 'session' | 'turn' | 'llm_call' | 'tool_exec' | 'memory_search' | 'delegation';
export type SpanStatus = 'ok' | 'error' | 'timeout' | 'cancelled';

export interface Span {
  id: string;
  traceId: string;
  parentId: string | null;
  sessionId: string;
  sessionKey: string | null;
  agentId: string;
  channel: string | null;
  accountId: string | null;
  conversationId: string | null;
  spanType: SpanType;
  name: string;
  startTs: number;
  endTs: number | null;
  durationMs: number | null;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  costInputUsd: number;
  costOutputUsd: number;
  model: string | null;
  provider: string | null;
  status: SpanStatus;
  errorMessage: string | null;
  runId: string | null;
  sequenceNum: number | null;
  source: string;
  metadata: Record<string, unknown>;
  createdAt: number;
}

export interface SpanTree extends Span {
  children: SpanTree[];
}

export interface SessionSummary {
  sessionId: string;
  agentId: string;
  channel: string | null;
  startTs: number;
  endTs: number | null;
  durationMs: number | null;
  totalCost: number;
  totalTokensIn: number;
  totalTokensOut: number;
  spanCount: number;
  errorCount: number;
  toolCalls: number;
  status: SpanStatus;
}

export interface AnalyticsParams {
  fromTs?: number;
  toTs?: number;
  agentId?: string;
  channel?: string;
  model?: string;
  limit?: number;
}

export interface AnalyticsDataPoint {
  label: string;
  value: number;
  count?: number;
  metadata?: Record<string, unknown>;
}

export interface AnalyticsResult {
  queryType: string;
  data: any[]; // Can be AnalyticsDataPoint[] or custom query result types
  metadata: {
    fromTs?: number;
    toTs?: number;
    totalRecords?: number;
  };
}

export interface TopologyNode {
  id: string;
  label: string;
  spanCount: number;
  totalCost: number;
  errorCount: number;
}

export interface TopologyEdge {
  source: string;
  target: string;
  count: number;
  status: 'ok' | 'mixed' | 'error';
}

export interface TopologyGraph {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  metadata: {
    fromTs?: number;
    toTs?: number;
  };
}

export interface ApiResponse<T> {
  data: T;
  meta?: {
    total?: number;
    offset?: number;
    limit?: number;
  };
  error?: {
    code: string;
    message: string;
  };
}

export interface SessionListFilters {
  agentId?: string;
  channel?: string;
  status?: SpanStatus;
  fromTs?: number;
  toTs?: number;
  limit?: number;
  offset?: number;
}

// =============================================================================
// API Client
// =============================================================================

const API_BASE = window.location.origin + '/clawlens/api';

export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function fetchApi<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let errorMessage = `API error: ${response.statusText}`;
    let errorCode = 'UNKNOWN_ERROR';

    try {
      const errorData = (await response.json()) as ApiResponse<null>;
      if (errorData.error) {
        errorMessage = errorData.error.message;
        errorCode = errorData.error.code;
      }
    } catch {
      // Failed to parse error response, use status text
    }

    throw new ApiError(errorMessage, errorCode, response.status);
  }

  const apiResponse = (await response.json()) as ApiResponse<T>;
  if (apiResponse.error) {
    throw new ApiError(apiResponse.error.message, apiResponse.error.code);
  }

  return apiResponse.data;
}

/**
 * Fetch session list with optional filters
 */
export async function fetchSessions(
  filters?: SessionListFilters
): Promise<SessionSummary[]> {
  const params = new URLSearchParams();
  if (filters?.agentId) params.set('agentId', filters.agentId);
  if (filters?.channel) params.set('channel', filters.channel);
  if (filters?.status) params.set('status', filters.status);
  if (filters?.fromTs) params.set('fromTs', filters.fromTs.toString());
  if (filters?.toTs) params.set('toTs', filters.toTs.toString());
  if (filters?.limit) params.set('limit', filters.limit.toString());
  if (filters?.offset) params.set('offset', filters.offset.toString());

  const queryString = params.toString();
  const path = `/sessions${queryString ? `?${queryString}` : ''}`;
  return fetchApi<SessionSummary[]>(path);
}

/**
 * Fetch session replay data (full span tree)
 */
export async function fetchSessionReplay(sessionId: string): Promise<SpanTree> {
  return fetchApi<SpanTree>(`/sessions/${sessionId}/replay`);
}

/**
 * Fetch session summary (aggregated stats)
 */
export async function fetchSessionSummary(sessionId: string): Promise<SessionSummary> {
  return fetchApi<SessionSummary>(`/sessions/${sessionId}/summary`);
}

/**
 * Execute analytics query
 */
export async function fetchAnalytics(
  queryType: string,
  params?: AnalyticsParams
): Promise<AnalyticsResult> {
  const queryParams = new URLSearchParams();
  if (params?.fromTs) queryParams.set('fromTs', params.fromTs.toString());
  if (params?.toTs) queryParams.set('toTs', params.toTs.toString());
  if (params?.agentId) queryParams.set('agentId', params.agentId);
  if (params?.channel) queryParams.set('channel', params.channel);
  if (params?.model) queryParams.set('model', params.model);
  if (params?.limit) queryParams.set('limit', params.limit.toString());

  const queryString = queryParams.toString();
  const path = `/analytics/${queryType}${queryString ? `?${queryString}` : ''}`;
  return fetchApi<AnalyticsResult>(path);
}

// =============================================================================
// Bots
// =============================================================================

export interface DelegationEntry {
  agentId: string;
  count: number;
  failureCount: number;
}

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
  delegatesTo: DelegationEntry[];
  delegatedFrom: DelegationEntry[];
}

/**
 * Fetch bots overview data
 */
export async function fetchBots(params?: {
  fromTs?: number;
  toTs?: number;
}): Promise<BotInfo[]> {
  const queryParams = new URLSearchParams();
  if (params?.fromTs) queryParams.set('fromTs', params.fromTs.toString());
  if (params?.toTs) queryParams.set('toTs', params.toTs.toString());
  const queryString = queryParams.toString();
  const path = `/bots${queryString ? `?${queryString}` : ''}`;
  return fetchApi<BotInfo[]>(path);
}

/**
 * Fetch topology data
 */
export async function fetchTopology(params?: {
  fromTs?: number;
  toTs?: number;
}): Promise<TopologyGraph> {
  const queryParams = new URLSearchParams();
  if (params?.fromTs) queryParams.set('fromTs', params.fromTs.toString());
  if (params?.toTs) queryParams.set('toTs', params.toTs.toString());

  const queryString = queryParams.toString();
  const path = `/topology${queryString ? `?${queryString}` : ''}`;
  return fetchApi<TopologyGraph>(path);
}

/**
 * Get the URL for exporting a session as HTML or JSON
 */
export function getSessionExportUrl(
  sessionId: string,
  format: 'html' | 'json'
): string {
  return `${API_BASE}/sessions/${sessionId}/export?format=${format}`;
}
