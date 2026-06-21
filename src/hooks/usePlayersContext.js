"use client";
import { createContext, useContext } from "react";
import { PLATFORMS, PLATFORM_LABELS } from "@/lib/league/LeagueModel";

export const PlayersCtx = createContext({
  // Player pool
  players: [], loading: true, error: null, findPlayer: () => null, refresh: () => {}, counts: {},

  // Multi-platform league store
  leagues: [], activeLeagueId: null, activeLeague: null,
  addLeague: () => {}, addSleeperLeague: () => {}, removeLeague: () => {}, switchLeague: () => {},
  PLATFORMS, PLATFORM_LABELS,

  // Live data for active league (normalized)
  rosters: [], users: [], transactions: [], matchups: {}, draftPicks: [],
  leagueLoading: false, leagueError: null, leagueLoaded: false,
  reloadLeague: () => {}, refreshAuth: () => {},

  // Derived from active league
  myTeamId: null, myRosterId: null, myRosterIds: [],

  // Legacy compat (TradesPage)
  leagueId: "", leagueInfo: null, setLeagueId: () => {}, setLeagueInfo: () => {}, setUserId: () => {},

  // UI state
  showLeagueManager: false, setShowLeagueManager: () => {},
});

export function usePlayersCtx() { return useContext(PlayersCtx); }
