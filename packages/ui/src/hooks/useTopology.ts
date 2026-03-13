/**
 * React hook for agent topology data
 */

import { useState, useEffect } from 'react';
import { fetchTopology } from '../api/client';
import type { TopologyGraph } from '../api/client';

export interface UseTopologyParams {
  fromTs?: number;
  toTs?: number;
}

export interface UseTopologyResult {
  topology: TopologyGraph | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useTopology(params: UseTopologyParams = {}): UseTopologyResult {
  const [topology, setTopology] = useState<TopologyGraph | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [refetchKey, setRefetchKey] = useState(0);

  const refetch = () => setRefetchKey((k) => k + 1);

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const result = await fetchTopology(params);
        if (!cancelled) {
          setTopology(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error('Topology fetch failed'));
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
  }, [JSON.stringify(params), refetchKey]);

  return { topology, loading, error, refetch };
}
