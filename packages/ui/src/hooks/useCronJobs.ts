/**
 * React hooks for cron jobs data with polling support
 */

import { useState, useEffect, useCallback } from 'react';
import { fetchCronJobs, fetchCronSummary, fetchCronJobRuns } from '../api/client';
import type { CronJob, CronSummary, CronRunEntry } from '../api/client';

export interface UseCronJobsResult {
  jobs: CronJob[];
  summary: CronSummary | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
  lastUpdated: Date | null;
}

export function useCronJobs(pollIntervalMs: number | null): UseCronJobsResult {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [summary, setSummary] = useState<CronSummary | null>(null);
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
        const [jobsResult, summaryResult] = await Promise.all([
          fetchCronJobs(),
          fetchCronSummary(),
        ]);
        if (!cancelled) {
          setJobs(jobsResult);
          setSummary(summaryResult);
          setLastUpdated(new Date());
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error('Cron fetch failed'));
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
  }, [pollIntervalMs, refetchKey]);

  return { jobs, summary, loading, error, refetch, lastUpdated };
}

export function useCronJobRuns(jobId: string | null): {
  runs: CronRunEntry[];
  loading: boolean;
  error: Error | null;
} {
  const [runs, setRuns] = useState<CronRunEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!jobId) {
      setRuns([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchCronJobRuns(jobId, 20, 0)
      .then((result) => {
        if (!cancelled) setRuns(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err : new Error('Runs fetch failed'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [jobId]);

  return { runs, loading, error };
}
