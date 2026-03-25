/**
 * React hook for bots overview data with polling support
 */

import { useState, useEffect, useCallback } from 'react';
import { fetchBots } from '../api/client';
import type { BotInfo } from '../api/client';

export interface UseBotsResult {
  bots: BotInfo[];
  loading: boolean;
  error: Error | null;
  refetch: () => void;
  lastUpdated: Date | null;
}

export interface BotFilters {
  fromTs?: number;
  toTs?: number;
}

export function useBots(pollIntervalMs: number | null, filters?: BotFilters): UseBotsResult {
  const [bots, setBots] = useState<BotInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refetchKey, setRefetchKey] = useState(0);

  const refetch = useCallback(() => setRefetchKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const result = await fetchBots(filters);
        if (!cancelled) {
          setBots(result);
          setLastUpdated(new Date());
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error('Bots fetch failed'));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchData();

    let intervalId: ReturnType<typeof setInterval> | null = null;
    if (pollIntervalMs != null && pollIntervalMs > 0) {
      intervalId = setInterval(fetchData, pollIntervalMs);
    }

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [pollIntervalMs, refetchKey, filters?.fromTs, filters?.toTs]);

  return { bots, loading, error, refetch, lastUpdated };
}
