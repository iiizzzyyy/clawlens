/**
 * React hooks for fetching session data
 */

import { useState, useEffect, useCallback } from 'react';
import {
  fetchSessions,
  fetchSessionReplay,
  fetchSessionSummary,
  type SessionSummary,
  type SessionListFilters,
  type SpanTree,
} from '../api/client';

// =============================================================================
// useSessions - Fetch session list
// =============================================================================

interface UseSessionsResult {
  sessions: SessionSummary[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useSessions(filters?: SessionListFilters): UseSessionsResult {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchSessions(filters);
      setSessions(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch sessions';
      setError(message);
      console.error('Error fetching sessions:', err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    sessions,
    loading,
    error,
    refetch: fetchData,
  };
}

// =============================================================================
// useSessionReplay - Fetch full session replay data
// =============================================================================

interface UseSessionReplayResult {
  sessionTree: SpanTree | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useSessionReplay(sessionId: string): UseSessionReplayResult {
  const [sessionTree, setSessionTree] = useState<SpanTree | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!sessionId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await fetchSessionReplay(sessionId);
      setSessionTree(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch session replay';
      setError(message);
      console.error('Error fetching session replay:', err);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    sessionTree,
    loading,
    error,
    refetch: fetchData,
  };
}

// =============================================================================
// useSessionSummary - Fetch session summary stats
// =============================================================================

interface UseSessionSummaryResult {
  summary: SessionSummary | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useSessionSummary(sessionId: string): UseSessionSummaryResult {
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!sessionId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await fetchSessionSummary(sessionId);
      setSummary(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch session summary';
      setError(message);
      console.error('Error fetching session summary:', err);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    summary,
    loading,
    error,
    refetch: fetchData,
  };
}
