/**
 * React hook for analytics queries
 */

import { useState, useEffect } from 'react';
import { fetchAnalytics } from '../api/client';
import type { AnalyticsResult, AnalyticsParams } from '../api/client';

export interface UseAnalyticsResult {
  data: AnalyticsResult | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Fetch analytics data with loading and error states
 */
export function useAnalytics(
  queryType: string | null,
  params: AnalyticsParams = {},
  enabled = true
): UseAnalyticsResult {
  const [data, setData] = useState<AnalyticsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [refetchKey, setRefetchKey] = useState(0);

  const refetch = () => setRefetchKey((k) => k + 1);

  useEffect(() => {
    if (!queryType || !enabled) {
      if (!enabled) setLoading(false);
      return;
    }

    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const result = await fetchAnalytics(queryType, params);
        if (!cancelled) {
          setData(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error('Analytics query failed'));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [queryType, JSON.stringify(params), refetchKey, enabled]);

  return { data, loading, error, refetch };
}
