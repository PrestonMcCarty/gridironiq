"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { PLATFORMS, PLATFORM_LABELS, makeLeagueId, EMPTY_LEAGUE_DATA } from "@/lib/league/LeagueModel";
import { getLeagueData, getMyRosterIds, getMyTeamId } from "@/lib/league/PlatformRegistry";
import { SleeperAdapter } from "@/lib/league/adapters/SleeperAdapter";

const STORAGE_KEY = "gridiron_iq_leagues_v2";
const STORAGE_AUTH_KEY = "gridiron_iq_auth_v1";   // refresh tokens only

// ── Storage helpers ────────────────────────────────────────────────────────
function readStorage() {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch { return null; }
}
function writeStorage(data) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
}
// Refresh tokens only — access tokens stay in memory
function readAuthStorage() {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(STORAGE_AUTH_KEY) || "{}"); } catch { return {}; }
}
function writeAuthStorage(data) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(STORAGE_AUTH_KEY, JSON.stringify(data)); } catch {}
}

/**
 * useLeagueStore
 * ==============
 * Multi-platform league store.  Persists league metadata to localStorage.
 * Live data (rosters, matchups, transactions) fetched fresh on every load/switch.
 *
 * Stored league shape:
 * {
 *   id:                string          composite key: `${platform}:${platformLeagueId}`
 *   platform:          "sleeper"|"yahoo"|"espn"
 *   platformLeagueId:  string
 *   name:              string
 *   season:            string
 *   type:              "Redraft"|"Keeper"|"Dynasty"
 *   scoring:           "PPR"|"Half-PPR"|"Standard"
 *   totalTeams:        number
 *   avatarUrl:         string|null
 *   userId:            string|null
 *   myTeamId:          string|null
 *   myRosterIds:       string[]        Sleeper-compatible player IDs
 *   slots:             object
 *   addedAt:           number
 *   lastRefreshed:     number|null
 * }
 */
export function useLeagueStore() {
  const [leagues,         setLeaguesRaw]        = useState([]);
  const [activeLeagueId,  setActiveLeagueIdRaw] = useState(null);

  // In-memory auth tokens (never persisted for security)
  const authTokens = useRef({});   // { [leagueId]: { accessToken, ... } }

  // Live data for active league
  const [liveData,      setLiveData]      = useState(EMPTY_LEAGUE_DATA);
  const [leagueLoading, setLeagueLoading] = useState(false);
  const [leagueError,   setLeagueError]   = useState(null);
  const [leagueLoaded,  setLeagueLoaded]  = useState(false);

  // ── Bootstrap from localStorage ───────────────────────────────────────────
  useEffect(() => {
    const saved = readStorage();
    if (!saved) return;
    if (Array.isArray(saved.leagues))  setLeaguesRaw(saved.leagues);
    if (saved.activeLeagueId)          setActiveLeagueIdRaw(saved.activeLeagueId);
  }, []);

  // ── Persist helpers ────────────────────────────────────────────────────────
  const persist = useCallback((lgs, activeId) => {
    writeStorage({ leagues: lgs, activeLeagueId: activeId });
  }, []);

  const setLeagues = useCallback((lgs, activeId) => {
    setLeaguesRaw(lgs);
    setActiveLeagueIdRaw(prev => {
      const next = activeId !== undefined ? activeId : prev;
      persist(lgs, next);
      return next;
    });
  }, [persist]);

  const setActiveLeagueId = useCallback((id) => {
    setActiveLeagueIdRaw(id);
    setLeaguesRaw(prev => { persist(prev, id); return prev; });
  }, [persist]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const activeLeague = leagues.find(l => l.id === activeLeagueId) ?? null;

  // ── Load live data ─────────────────────────────────────────────────────────
  const loadLeagueData = useCallback(async (leagueId) => {
    const league = leagues.find(l => l.id === leagueId);
    if (!league) return;

    console.info(`[LeagueStore] Loading ${PLATFORM_LABELS[league.platform]} league: ${league.name}`);
    setLeagueLoading(true);
    setLeagueError(null);
    setLeagueLoaded(false);
    setLiveData(EMPTY_LEAGUE_DATA);

    try {
      // Attach in-memory auth token for platforms that need it
      const auth = authTokens.current[leagueId] || {};
      const data = await getLeagueData({ ...league, _auth: auth });

      console.info(`[LeagueStore] ✓ ${league.name}: ${data.rosters.length} rosters loaded`);

      // Resolve myTeamId and myRosterIds from live data, patch stored league
      const myTeamId    = data.myTeamId || getMyTeamId(league.platform, data, league.userId);
      const myRosterIds = getMyRosterIds(league.platform, data, league.userId);

      console.info(`[LeagueStore] ✓ My roster: ${myRosterIds.length} players`);

      setLeaguesRaw(prev => {
        const updated = prev.map(l =>
          l.id === leagueId
            ? { ...l, myTeamId, myRosterIds, lastRefreshed: Date.now() }
            : l
        );
        persist(updated, leagueId);
        return updated;
      });

      setLiveData(data);
      setLeagueLoaded(true);
    } catch (e) {
      console.error(`[LeagueStore] ✗ Failed:`, e.message);
      setLeagueError(e.message);
    } finally {
      setLeagueLoading(false);
    }
  }, [leagues, persist]);

  // Re-load when active league changes
  useEffect(() => {
    if (activeLeagueId) loadLeagueData(activeLeagueId);
    else { setLiveData(EMPTY_LEAGUE_DATA); setLeagueLoaded(false); }
  }, [activeLeagueId]);   // eslint-disable-line react-hooks/exhaustive-deps
  // Note: loadLeagueData excluded from deps intentionally to avoid re-fetch loops

  // ── Derived roster data from active league metadata (persisted) ────────────
  const myTeamId    = activeLeague?.myTeamId    ?? null;
  const myRosterIds = activeLeague?.myRosterIds ?? [];
  // Legacy compat — engines that use myRosterId
  const myRosterId  = myTeamId;

  // ── Add league ─────────────────────────────────────────────────────────────
  const addLeague = useCallback(async (platform, credentials, infoOrNull = null) => {
    const adapter = (await import("@/lib/league/PlatformRegistry")).getAdapter(platform);

    let info = infoOrNull;
    if (!info) {
      const results = await adapter.getLeaguesForUser(credentials);
      // If single result (e.g. ESPN by ID), use it; otherwise let UI pick
      if (results.length === 1) info = results[0];
      else throw new Error(`Found ${results.length} leagues — use getLeaguesForUser to let the user pick`);
    }

    const id = makeLeagueId(platform, info.platformLeagueId);
    const entry = {
      id,
      platform,
      platformLeagueId: info.platformLeagueId,
      name:             info.name,
      season:           info.season,
      type:             info.type,
      scoring:          info.scoring,
      totalTeams:       info.totalTeams,
      avatarUrl:        info.avatarUrl ?? null,
      userId:           credentials.userId || credentials.guid || null,
      myTeamId:         null,
      myRosterIds:      [],
      slots:            info.slots || {},
      addedAt:          Date.now(),
      lastRefreshed:    null,
    };

    // Store auth token in memory (access token) + refresh token persisted
    if (credentials.accessToken)  authTokens.current[id] = { accessToken: credentials.accessToken };
    if (credentials.refreshToken) {
      const stored = readAuthStorage();
      writeAuthStorage({ ...stored, [id]: { refreshToken: credentials.refreshToken } });
    }

    setLeaguesRaw(prev => {
      const existing = prev.findIndex(l => l.id === id);
      const updated  = existing >= 0
        ? prev.map((l, i) => i === existing ? { ...l, ...entry } : l)
        : [...prev, entry];
      persist(updated, id);
      return updated;
    });
    setActiveLeagueIdRaw(id);
    return entry;
  }, [persist]);

  // ── Add Sleeper league directly (convenience wrapper used by LeagueManager) ─
  const addSleeperLeague = useCallback(async (platformLeagueId, userId, infoOrNull) => {
    let info = infoOrNull;
    if (!info) info = await SleeperAdapter.getLeagueInfo(platformLeagueId);
    return addLeague(PLATFORMS.SLEEPER, { userId }, info);
  }, [addLeague]);

  // ── Remove league ──────────────────────────────────────────────────────────
  const removeLeague = useCallback((leagueId) => {
    delete authTokens.current[leagueId];
    const stored = readAuthStorage();
    delete stored[leagueId];
    writeAuthStorage(stored);

    setLeaguesRaw(prev => {
      const updated = prev.filter(l => l.id !== leagueId);
      const newActive = activeLeagueId === leagueId
        ? (updated[0]?.id ?? null)
        : activeLeagueId;
      persist(updated, newActive);
      setActiveLeagueIdRaw(newActive);
      return updated;
    });
  }, [activeLeagueId, persist]);

  // ── Switch active league ───────────────────────────────────────────────────
  const switchLeague = useCallback((leagueId) => {
    setActiveLeagueId(leagueId);
  }, [setActiveLeagueId]);

  // ── Refresh auth token (Yahoo) ─────────────────────────────────────────────
  const refreshAuth = useCallback(async (leagueId) => {
    const stored = readAuthStorage();
    const rt = stored[leagueId]?.refreshToken;
    if (!rt) return false;
    try {
      const r = await fetch("/api/yahoo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh", refreshToken: rt }),
      });
      const data = await r.json();
      if (data.accessToken) {
        authTokens.current[leagueId] = { accessToken: data.accessToken };
        if (data.refreshToken) writeAuthStorage({ ...stored, [leagueId]: { refreshToken: data.refreshToken } });
        return true;
      }
    } catch {}
    return false;
  }, []);

  return {
    // Stored leagues (all platforms)
    leagues,
    activeLeagueId,
    activeLeague,
    // Live data for active league (normalized)
    rosters:      liveData.rosters,
    matchups:     liveData.matchups,
    transactions: liveData.transactions,
    draftPicks:   liveData.draftPicks,
    leagueLoading,
    leagueError,
    leagueLoaded,
    // Derived
    myTeamId,
    myRosterId,    // legacy alias
    myRosterIds,
    // Users map for active league (build from rosters)
    users: liveData.rosters.map(r => ({
      user_id:      r.ownerId,
      display_name: r.ownerName,
      metadata:     { team_name: r.teamName },
    })),
    // Actions
    addLeague,
    addSleeperLeague,
    removeLeague,
    switchLeague,
    reloadLeague: () => loadLeagueData(activeLeagueId),
    refreshAuth,
    // Auth helpers
    setAuthToken: (leagueId, token) => { authTokens.current[leagueId] = token; },
    PLATFORMS,
    PLATFORM_LABELS,
  };
}
