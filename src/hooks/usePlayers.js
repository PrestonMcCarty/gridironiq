"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { SleeperService }        from "@/lib/services/sleeper";
import { FantasyCalcService }    from "@/lib/services/fantasycalc";
import { LiveDataService, getStatWeeks } from "@/lib/services/liveDataService";
import { ESPNService }            from "@/lib/services/espn";
import { PlayerIntelligence, computeDefensiveRankings } from "@/lib/engines/playerIntelligence";
import { initNflState, CURRENT_SEASON, CURRENT_WEEK } from "@/lib/constants";
import { NFLScheduleService }    from "@/lib/data/nflSchedule";
import { computeDataHealth, logHealthReport } from "@/lib/data/dataHealth";
import { initialiseCrosswalk, logCrosswalkReport } from "@/lib/identity/crosswalkStore";
import { loadHistoricalArtifact, lookupHistorical, logHistoricalCoverageReport } from "@/lib/historical/historicalLoader";

const POLL_INTERVAL_MS = 60_000; // check for stale slots every 60 s

export function usePlayers(scoring = "PPR", isSuperflex = false) {
  const [state, setState] = useState({
    players: [], loading: true, error: null, source: null, counts: {}, historicalCoverage: null,
  });

  // Hold the last enriched player array so we can do partial re-enrichment
  // without re-fetching static data (crosswalk, historical artifact, ADP ranking).
  const basePlayersRef    = useRef([]); // enriched after historical join + ADP sort
  const defRanksByPosRef  = useRef({});
  const byeWeekMapRef     = useRef({});
  const fcNameMapRef      = useRef({});
  const trendingIdsRef    = useRef(new Set());
  const sleeperPlayersRef = useRef({});

  // ── Full initial load ─────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      await initNflState();
      const season = CURRENT_SEASON;
      const week   = CURRENT_WEEK;

      // Trigger LiveDataService initial load (idempotent — no-ops if already loaded)
      await LiveDataService.initialLoad(isSuperflex);

      const live = LiveDataService.getAll();

      const sleeperPlayers = live.players || {};
      const fcValues       = live.fantasyCalc || [];
      const trending       = live.trending || [];
      const weekProj       = live.projections || {};
      const multiWeekStats = live.stats || [];
      const scheduleOpps   = live.schedule?.opponents || {};
      // Global offseason signal: have any games been played in the fetched weeks?
      const seasonStarted  = Array.isArray(multiWeekStats)
        && multiWeekStats.some(ws => ws && Object.keys(ws).length > 0);

      sleeperPlayersRef.current = sleeperPlayers;

      const fcNameMap = FantasyCalcService.buildNameMap(fcValues);
      fcNameMapRef.current = fcNameMap;

      const posCounter = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 };
      const trendingIds = new Set(trending.map(t => t.player_id));
      trendingIdsRef.current = trendingIds;

      // Per-week schedules (index-aligned with the stat weeks) so each
      // performance is attributed to the defense the player actually faced.
      const statWeeks = getStatWeeks();
      const weekOpponentMaps = await Promise.all(
        statWeeks.map(w => ESPNService.getWeekOpponentMap(CURRENT_SEASON, w).catch(() => ({})))
      );
      const defRanksByPos = computeDefensiveRankings(
        Array.isArray(multiWeekStats) ? multiWeekStats : [],
        sleeperPlayers,
        weekOpponentMaps,
      );
      defRanksByPosRef.current = defRanksByPos;

      const byeWeekMap       = NFLScheduleService.buildByeWeekMap(sleeperPlayers);
      byeWeekMapRef.current = byeWeekMap;
      const byeWeekMapHealth = NFLScheduleService.validateByeWeekMap(byeWeekMap);
      if (byeWeekMapHealth.missing.length) {
        console.warn(`[GridironIQ] Bye week missing for: ${byeWeekMapHealth.missing.join(", ")}`);
      }

      initialiseCrosswalk(sleeperPlayers);
      logCrosswalkReport();

      const historicalLoadPromise = loadHistoricalArtifact();
      const fetchedAt = Date.now();

      const RELEVANT = ["QB", "RB", "WR", "TE", "K", "DEF"];
      const EXCLUDE_STATUSES = new Set(["Retired", "retired", "Suspended", "suspended"]);

      const playerArr = Object.entries(sleeperPlayers)
        .map(([playerId, sp]) => {
          const normalizedPos = sp.position === "DEF" ? "DST" : sp.position;
          return { ...sp, player_id: playerId, position: normalizedPos };
        })
        .filter(p => {
          if (p.position === "DST") return !!p.team;
          if (!p.full_name) return false;
          if (!RELEVANT.includes(p.position)) return false;
          if (p.status && EXCLUDE_STATUSES.has(p.status)) return false;
          if (p.team) return true;
          return p.search_rank != null && p.search_rank <= 500 && p.status === "Active";
        })
        .sort((a, b) => {
          const aHasTeam = a.team && a.team !== "FA" ? 1 : 0;
          const bHasTeam = b.team && b.team !== "FA" ? 1 : 0;
          if (bHasTeam !== aHasTeam) return bHasTeam - aHasTeam;
          const aRank = a.search_rank ?? 99999;
          const bRank = b.search_rank ?? 99999;
          if (aRank !== bRank) return aRank - bRank;
          return (a.full_name || "").localeCompare(b.full_name || "");
        });

      const undefinedIds = playerArr.filter(sp => !sp.player_id);
      if (undefinedIds.length) {
        console.warn(`[GridironIQ] ${undefinedIds.length} players missing player_id`);
      }

      const enriched = playerArr.map(sp => {
        const pid = sp.player_id;
        const weeklyScores = Array.isArray(multiWeekStats)
          ? multiWeekStats.map(ws => {
              const s = ws[pid];
              if (!s || Object.keys(s).length === 0) return null;
              return SleeperService.calcPPG(s, scoring);
            }).filter(v => v !== null)
          : [];

        // Prefer Sleeper's in-season opponent_abbr; fall back to the ESPN
        // schedule map (fixes the offseason "No opponent data" vacuum).
        const nextOpp = sp.opponent_abbr || scheduleOpps[sp.team]?.opp || null;
        const fc      = FantasyCalcService.lookup(sp, fcNameMap);
        const proj    = weekProj[pid] || null;
        if (posCounter[sp.position] !== undefined) posCounter[sp.position]++;
        const currentPosRank = posCounter[sp.position] || null;

        return PlayerIntelligence.compute(
          { ...sp, ownership_pct: trendingIds.has(pid) ? (sp.ownership ?? 50) : (sp.ownership ?? 20) },
          weeklyScores, proj, fc, defRanksByPos, scoring, nextOpp,
          currentPosRank, byeWeekMap,
          live.fetchedAt,  // ← freshness timestamps for _live metadata
          seasonStarted,   // ← global offseason signal
        );
      });

      enriched.forEach(p => {
        p.news = p.news.map(n => ({
          ...n,
          waiver: n.waiver || (trendingIds.has(p.sleeperPlayerId) && (p.owned || 0) < 60),
        }));
      });

      enriched.sort((a, b) => b.ppg - a.ppg);

      await historicalLoadPromise;

      const historicalByPos = { QB:{matched:0,total:0}, RB:{matched:0,total:0}, WR:{matched:0,total:0}, TE:{matched:0,total:0}, K:{matched:0,total:0}, DST:{matched:0,total:0} };
      let historicalMatched = 0;

      enriched.forEach(p => {
        const canonId = p.pos === "DST"
          ? `giq:dst:${(p.team || "").toUpperCase()}`
          : `giq:${p.id}`;
        const hist = lookupHistorical(canonId);
        if (historicalByPos[p.pos]) historicalByPos[p.pos].total++;
        if (hist) {
          historicalMatched++;
          if (historicalByPos[p.pos]) historicalByPos[p.pos].matched++;
          p.historical2024     = hist;
          p.fantasyPoints2024  = hist.fantasy_points_ppr ?? null;
          p.ppg2024            = hist.ppg_ppr            ?? null;
          p.finish2024         = hist.overall_finish      ?? null;
          p.positionFinish2024 = hist.position_finish     ?? null;
        } else {
          p.historical2024 = p.fantasyPoints2024 = p.ppg2024 = p.finish2024 = p.positionFinish2024 = null;
        }
      });

      const historicalCoverage = logHistoricalCoverageReport(enriched, enriched.length, historicalMatched, historicalByPos);

      // ── ADP ranking pass ───────────────────────────────────────────────────
      enriched.sort((a, b) => {
        const aHasReal = a.adpSource === "fantasycalc_rank";
        const bHasReal = b.adpSource === "fantasycalc_rank";
        const aHasEst  = a.adp != null;
        const bHasEst  = b.adp != null;
        if (aHasReal !== bHasReal) return aHasReal ? -1 : 1;
        if (aHasEst  !== bHasEst)  return aHasEst  ? -1 : 1;
        if (a.adp != null && b.adp != null) {
          if (a.adp !== b.adp) return a.adp - b.adp;
          return b.ppg - a.ppg;
        }
        return b.ppg - a.ppg;
      });

      const posRankCounters = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 };
      enriched.forEach((p, idx) => {
        p.overallRank = idx + 1;
        if (posRankCounters[p.pos] !== undefined) posRankCounters[p.pos]++;
        p.posRank = posRankCounters[p.pos] || 1;
        if (p.adp == null) { p.adp = p.overallRank + 0.1; p.adpSource = "derived"; }
        if (p.positionalAdp == null) p.positionalAdp = p.posRank + 0.1;
      });

      const counts = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0, FA: 0, IR: 0 };
      enriched.forEach(p => {
        if (counts[p.pos] !== undefined) counts[p.pos]++;
        if (p.pos !== "DST" && (!p.team || p.team === "FA")) counts.FA++;
        if (p.injury === "IR") counts.IR++;
      });

      basePlayersRef.current = enriched;

      setState({ players: enriched, loading: false, error: null, source: "live", counts, historicalCoverage });

      const healthReport = computeDataHealth(enriched, { fetchedAt, season, week, byeWeekMapHealth });
      logHealthReport(healthReport);
      setState(s => ({ ...s, health: healthReport }));

    } catch (err) {
      console.error("[GridironIQ] load error:", err);
      setState(s => ({ ...s, loading: false, error: err.message, source: "error" }));
    }
  }, [scoring, isSuperflex]);

  // ── Live data polling ────────────────────────────────────────────────────
  // Re-enriches players when short-TTL slots (players, projections, trending) update.
  // Does NOT redo the full load — only patches _live, ppg, injury, aiRecommendation.
  const patchFromLive = useCallback(() => {
    const base = basePlayersRef.current;
    if (!base.length) return;

    const live = LiveDataService.getAll();
    const sleeperPlayers = live.players || sleeperPlayersRef.current;
    const weekProj = live.projections || {};
    const trending = live.trending || [];
    const multiWeekStats = live.stats;
    const scheduleOpps = live.schedule?.opponents || {};
    const seasonStarted = Array.isArray(multiWeekStats)
      && multiWeekStats.some(ws => ws && Object.keys(ws).length > 0);
    const trendingIds = new Set(trending.map(t => t.player_id));
    trendingIdsRef.current = trendingIds;

    const weeklyScoresCache = {};
    if (Array.isArray(multiWeekStats)) {
      // Pre-build weekly scores per pid from cached stats (cheap)
      base.forEach(p => {
        const pid = p.sleeperPlayerId;
        if (!pid) return;
        weeklyScoresCache[pid] = multiWeekStats.map(ws => {
          const s = ws[pid];
          if (!s || Object.keys(s).length === 0) return null;
          return SleeperService.calcPPG(s, scoring);
        }).filter(v => v !== null);
      });
    }

    const updated = base.map(p => {
      const pid = p.sleeperPlayerId;
      const sp  = pid ? sleeperPlayers[pid] : null;
      if (!sp) return p;

      const weeklyScores = weeklyScoresCache[pid] || [];
      const proj         = weekProj[pid] || null;
      const fc           = FantasyCalcService.lookup(sp, fcNameMapRef.current);

      const recomputed = PlayerIntelligence.compute(
        { ...sp, player_id: pid, position: sp.position === "DEF" ? "DST" : sp.position,
          ownership_pct: trendingIds.has(pid) ? (sp.ownership ?? 50) : (sp.ownership ?? 20) },
        weeklyScores, proj, fc,
        defRanksByPosRef.current, scoring,
        sp.opponent_abbr || scheduleOpps[sp.team]?.opp || null,
        p.posRank, byeWeekMapRef.current,
        live.fetchedAt,
        seasonStarted,
      );

      // Preserve fields that don't change on live refresh
      return {
        ...recomputed,
        overallRank:        p.overallRank,
        posRank:            p.posRank,
        historical2024:     p.historical2024,
        fantasyPoints2024:  p.fantasyPoints2024,
        ppg2024:            p.ppg2024,
        finish2024:         p.finish2024,
        positionFinish2024: p.positionFinish2024,
        news: recomputed.news.map(n => ({
          ...n,
          waiver: n.waiver || (trendingIds.has(pid) && (recomputed.owned || 0) < 60),
        })),
      };
    });

    setState(s => ({ ...s, players: updated }));
  }, [scoring]);

  // Initial load on mount
  useEffect(() => { load(); }, [load]);

  // Polling — subscribe to LiveDataService updates
  useEffect(() => {
    const unsub = LiveDataService.subscribe(() => {
      // Only patch (no full reload) when base data is already loaded
      if (basePlayersRef.current.length) patchFromLive();
    });

    const timer = setInterval(() => {
      LiveDataService.refreshStale(isSuperflex).catch(console.error);
    }, POLL_INTERVAL_MS);

    return () => { unsub(); clearInterval(timer); };
  }, [patchFromLive, isSuperflex]);

  return { ...state, refresh: load };
}
