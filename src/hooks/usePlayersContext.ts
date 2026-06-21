"use client";
import { createContext, useContext } from "react";
import { PLATFORMS, PLATFORM_LABELS } from "@/lib/league/LeagueModel";

// ── Context type — every signature must match the real implementation ────────
export interface PlayersCtxType {
  // Player pool
  players:    any[];
  loading:    boolean;
  error:      string | null;
  findPlayer: (id: string) => any;          // takes id — was () => null in default
  refresh:    () => void;
  counts:     Record<string, number>;

  // Multi-platform league store
  leagues:         any[];
  activeLeagueId:  string | null;
  activeLeague:    any | null;
  addLeague:       (platform: string, credentials: any, infoOrNull?: any) => Promise<any>;
  addSleeperLeague:(platformLeagueId: string, userId: string | null, infoOrNull: any) => Promise<any>;
  removeLeague:    (leagueId: string) => void;
  switchLeague:    (leagueId: string) => void;
  PLATFORMS:       typeof PLATFORMS;
  PLATFORM_LABELS: typeof PLATFORM_LABELS;

  // Live data for active league (normalized)
  rosters:       any[];
  users:         any[];
  transactions:  any[];
  matchups:      Record<string, any[]>;
  draftPicks:    any[];
  leagueLoading: boolean;
  leagueError:   string | null;
  leagueLoaded:  boolean;
  reloadLeague:  () => void;
  refreshAuth:   (leagueId: string) => Promise<boolean>;

  // Derived from active league
  myTeamId:    string | null;
  myRosterId:  string | null;
  myRosterIds: string[];

  // Legacy compat (TradesPage)
  leagueId:     string;
  leagueInfo:   any | null;
  setLeagueId:  () => void;
  setLeagueInfo:() => void;
  setUserId:    () => void;

  // UI state
  showLeagueManager:    boolean;
  setShowLeagueManager: (show: boolean) => void;
}

// Default values — stubs that satisfy the interface types
const defaultCtx: PlayersCtxType = {
  players: [], loading: true, error: null,
  findPlayer:    (_id: string) => null,       // correct signature: takes id
  refresh:       () => {},
  counts:        {},

  leagues: [], activeLeagueId: null, activeLeague: null,
  addLeague:        (_platform: string, _credentials: any, _info?: any) => Promise.resolve(null),
  addSleeperLeague: (_id: string, _uid: string | null, _info: any)      => Promise.resolve(null),
  removeLeague:     (_leagueId: string) => {},
  switchLeague:     (_leagueId: string) => {},
  PLATFORMS,
  PLATFORM_LABELS,

  rosters: [], users: [], transactions: [], matchups: {}, draftPicks: [],
  leagueLoading: false, leagueError: null, leagueLoaded: false,
  reloadLeague: () => {},
  refreshAuth:  (_leagueId: string) => Promise.resolve(false),

  myTeamId: null, myRosterId: null, myRosterIds: [],

  leagueId: "", leagueInfo: null,
  setLeagueId:   () => {},
  setLeagueInfo: () => {},
  setUserId:     () => {},

  showLeagueManager: false,
  setShowLeagueManager: (_show: boolean) => {},
};

export const PlayersCtx = createContext<PlayersCtxType>(defaultCtx);

export function usePlayersCtx(): PlayersCtxType {
  return useContext(PlayersCtx);
}
