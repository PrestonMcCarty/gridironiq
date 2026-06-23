"use client";
import { useState, useEffect, useRef } from "react";
import { LiveDataService } from "@/lib/services/liveDataService";

const POLL_INTERVAL_MS = 60_000; // check for stale slots every 60 s

/**
 * useLiveData
 * ═══════════
 * React hook that manages the live data polling loop.
 *
 * On mount: triggers LiveDataService.initialLoad().
 * Every 60 s: calls LiveDataService.refreshStale() — only stale slots re-fetch.
 * Subscribes to LiveDataService slot updates and re-renders consumers.
 *
 * Returns:
 *   liveData        — { players, projections, trending, stats, fantasyCalc, fetchedAt }
 *   isRefreshing    — true while any slot is loading
 *   lastRefresh     — epoch ms of most recent slot update
 *   staleFlags      — slot names whose data exceeds 30-min staleness threshold
 */
export function useLiveData(isSuperflex = false) {
  const [liveData, setLiveData] = useState(() => LiveDataService.getAll());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const superflex = useRef(isSuperflex);
  superflex.current = isSuperflex;

  useEffect(() => {
    // Subscribe to slot updates
    const unsub = LiveDataService.subscribe(slots => {
      setLiveData(LiveDataService.getAll());
      setLastRefresh(Date.now());
      const loading = Object.values(slots).some(s => s.isLoading);
      setIsRefreshing(loading);
    });

    // Initial full load (no-op if already loaded this session)
    LiveDataService.initialLoad(superflex.current).catch(console.error);

    // Polling loop — only refreshes slots past their TTL
    const timer = setInterval(() => {
      LiveDataService.refreshStale(superflex.current).catch(console.error);
    }, POLL_INTERVAL_MS);

    return () => {
      unsub();
      clearInterval(timer);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const staleFlags = LiveDataService.getStaleFlags(30 * 60_000);

  return { liveData, isRefreshing, lastRefresh, staleFlags };
}
