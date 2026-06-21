"use client";
import { useState, useEffect, useCallback } from "react";
import { SleeperLeagueService } from "@/lib/services/sleeperLeague";

export function useLeagueData(leagueId) {
  const [state, setState] = useState({
    rosters: [], users: [], leagueInfo: null, transactions: [],
    matchupHistory: {}, loading: false, error: null, loaded: false,
  });

  const load = useCallback(async () => {
    if (!leagueId) return;
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const [rosters, users, leagueInfo] = await Promise.all([
        SleeperLeagueService.getRosters(leagueId),
        SleeperLeagueService.getUsers(leagueId),
        SleeperLeagueService.getLeagueInfo(leagueId),
      ]);
      const transactions = await SleeperLeagueService.getFullTransactionHistory(leagueId);
      setState({ rosters, users, leagueInfo, transactions, matchupHistory: {}, loading: false, error: null, loaded: true });
    } catch (e) {
      setState(s => ({ ...s, loading: false, error: e.message, loaded: false }));
    }
  }, [leagueId]);

  useEffect(() => { if (leagueId) load(); }, [leagueId, load]);

  return { ...state, reload: load };
}
