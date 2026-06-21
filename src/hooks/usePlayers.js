"use client";
import { useState, useEffect, useCallback } from "react";
import { SleeperService }      from "@/lib/services/sleeper";
import { FantasyCalcService }  from "@/lib/services/fantasycalc";
import { PlayerIntelligence, computeDefensiveRankings } from "@/lib/engines/playerIntelligence";
import { initNflState, CURRENT_SEASON, CURRENT_WEEK } from "@/lib/constants";

export function usePlayers(scoring = "PPR", isSuperflex = false) {
  const [state, setState] = useState({ players: [], loading: true, error: null, source: null, counts: {} });

  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      // ── Step 0: resolve live season/week from Sleeper before anything else ──
      await initNflState();

      // Now CURRENT_SEASON and CURRENT_WEEK are correct for the live season.
      const season = CURRENT_SEASON;
      const week   = CURRENT_WEEK;

      const [sleeperPlayers, fcValues, trending] = await Promise.all([
        SleeperService.getPlayers(),
        FantasyCalcService.getValues(isSuperflex),
        SleeperService.getTrending("add"),
      ]);

      // ── Build FantasyCalc name lookup map ────────────────────────────────
      // Uses multiple name-variant keys per player for robust matching.
      const fcNameMap = FantasyCalcService.buildNameMap(fcValues);

      // Track positional counts for ADP fallback computation later
      const posCounter = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 };

      const trendingIds = new Set(trending.map(t => t.player_id));

      const weekStats = await SleeperService.getStats(season, week);
      const weekProj  = await SleeperService.getProjections(season, week);

      // Fetch last 8 weeks of the *live* season (not hardcoded 2024 wk 18)
      const weekNums = Array.from({ length: 8 }, (_, i) => Math.max(1, week - 7 + i));
      const multiWeekStats = await Promise.all(
        weekNums.map(w => SleeperService.getStats(season, w))
      );

      const defRanksByPos = computeDefensiveRankings(multiWeekStats, sleeperPlayers);

      const RELEVANT = ["QB", "RB", "WR", "TE", "K", "DEF"];
      // Sleeper uses "DEF" for D/ST team defenses.
      // We normalize to "DST" internally for consistency with fantasy conventions.
      // All 32 NFL teams appear in the players endpoint as DEF entries.

      const EXCLUDE_STATUSES = new Set([
        "Retired", "retired",
        "Suspended", "suspended",
      ]);

      const playerArr = Object.entries(sleeperPlayers)
        .map(([playerId, sp]) => {
          // Normalize Sleeper's DEF position to DST
          const normalizedPos = sp.position === "DEF" ? "DST" : sp.position;
          return { ...sp, player_id: playerId, position: normalizedPos };
        })
        .filter(p => {
          // D/ST team entries use full_name (team city+name) and position DST.
          // They have null status — pass them through unconditionally if position is DST.
          if (p.position === "DST") return !!(p.full_name && p.team);

          // Skill players and kickers: must have a name and relevant position
          if (!p.full_name) return false;
          if (!RELEVANT.includes(p.position)) return false;

          // Explicitly retired/suspended players are excluded
          if (p.status && EXCLUDE_STATUSES.has(p.status)) return false;

          // Players with no status at all who also have no team and no
          // depth_chart_order are historical records — exclude them.
          if (!p.status && !p.team && !p.depth_chart_order && !p.search_rank) return false;

          return true;
        })
        .sort((a, b) => {
          // Sort priority:
          //  1. Players with a current NFL team first (assigned > FA/unsigned)
          //  2. Within same team-status: higher search_rank first (popularity)
          //  3. Fallback: alphabetical by name
          const aHasTeam = a.team && a.team !== "FA" ? 1 : 0;
          const bHasTeam = b.team && b.team !== "FA" ? 1 : 0;
          if (bHasTeam !== aHasTeam) return bHasTeam - aHasTeam;
          const aRank = a.search_rank ?? 99999;
          const bRank = b.search_rank ?? 99999;
          if (aRank !== bRank) return aRank - bRank;
          return (a.full_name || "").localeCompare(b.full_name || "");
        });

      // ── Pipeline validation: confirm player_id injection worked ──────────
      const undefinedIds = playerArr.filter(sp => !sp.player_id);
      if (undefinedIds.length > 0) {
        console.warn(`[GridironIQ] WARNING: ${undefinedIds.length} players have no player_id after Object.entries injection — these will fail roster lookup`);
      } else {
        console.info(`[GridironIQ] ✓ player_id present on all ${playerArr.length} filtered players`);
      }
      // Spot-check: log first 3 player IDs so we can verify in the console
      console.info(`[GridironIQ] Sample player IDs: ${playerArr.slice(0, 3).map(sp => `${sp.player_id}=${sp.full_name}`).join(', ')}`);

      // ── No hard cap — process every qualifying player ──────────────────────
      const enriched = playerArr.map(sp => {
        const pid = sp.player_id;

        const weeklyScores = multiWeekStats
          .map(ws => { const s = ws[pid]; return s ? SleeperService.calcPPG(s, scoring) : null; })
          .filter(v => v !== null);
        const nextOpp = sp.opponent_abbr || null;

        // Use the new robust name-map lookup instead of simple normalize()
        const fc   = FantasyCalcService.lookup(sp, fcNameMap);
        const proj = weekProj[pid] || null;

        // Track positional rank for fallback ADP computation
        const pos = sp.position;
        if (posCounter[pos] !== undefined) posCounter[pos]++;
        const currentPosRank = posCounter[pos] || null;

        const player = PlayerIntelligence.compute(
          { ...sp, ownership_pct: trendingIds.has(pid) ? (sp.ownership ?? 50) : (sp.ownership ?? 20) },
          weeklyScores, proj, fc, defRanksByPos, scoring, nextOpp,
          currentPosRank,
        );
        player.news = player.news.map(n => ({
          ...n,
          waiver: n.waiver || (trendingIds.has(pid) && (player.owned || 0) < 60),
        }));
        return player;
      });

      enriched.sort((a, b) => b.ppg - a.ppg);

      // ── Validation: per-position counts ─────────────────────────────────
      const counts = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0, FA: 0, IR: 0 };
      enriched.forEach(p => {
        if (counts[p.pos] !== undefined) counts[p.pos]++;
        if (p.pos !== "DST" && (!p.team || p.team === "FA")) counts.FA++;
        if (p.injury === "IR") counts.IR++;
      });
      // ── Position Coverage Validation Report ────────────────────────────
      const NFL_TEAM_COUNT = 32;
      const dstGap = NFL_TEAM_COUNT - counts.DST;
      console.info(
        `[GridironIQ] Position Coverage Validation Report\n` +
        `  QB:${counts.QB}  RB:${counts.RB}  WR:${counts.WR}  TE:${counts.TE}  K:${counts.K}  DST:${counts.DST}\n` +
        `  FA:${counts.FA}  IR:${counts.IR}\n` +
        `  Total: ${enriched.length} | Season:${season} Week:${week}\n` +
        (dstGap > 0 ? `  ⚠ DST GAP: ${dstGap} teams missing` : `  ✓ All ${NFL_TEAM_COUNT} D/ST teams present`) +
        (counts.K < 32  ? `\n  ⚠ K gap: only ${counts.K} kickers (expected ~32+)` : `\n  ✓ Kicker pool healthy (${counts.K})`)
      );

      setState({ players: enriched, loading: false, error: null, source: "live", counts });
    } catch (err) {
      console.error("[GridironIQ] load error:", err);
      setState(s => ({ ...s, loading: false, error: err.message, source: "error" }));
    }
  }, [scoring, isSuperflex]);

  useEffect(() => { load(); }, [load]);

  return { ...state, refresh: load };
}
