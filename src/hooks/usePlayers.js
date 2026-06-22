"use client";
import { useState, useEffect, useCallback } from "react";
import { SleeperService }        from "@/lib/services/sleeper";
import { FantasyCalcService }    from "@/lib/services/fantasycalc";
import { PlayerIntelligence, computeDefensiveRankings } from "@/lib/engines/playerIntelligence";
import { initNflState, CURRENT_SEASON, CURRENT_WEEK } from "@/lib/constants";
import { NFLScheduleService }    from "@/lib/data/nflSchedule";
import { computeDataHealth, logHealthReport } from "@/lib/data/dataHealth";
import { initialiseCrosswalk, logCrosswalkReport, getCrosswalkHealth } from "@/lib/identity/crosswalkStore";
import { loadHistoricalArtifact, lookupHistorical, logHistoricalCoverageReport } from "@/lib/historical/historicalLoader";

export function usePlayers(scoring = "PPR", isSuperflex = false) {
  const [state, setState] = useState({ players: [], loading: true, error: null, source: null, counts: {}, historicalCoverage: null });

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

      // ── Build live bye week map from Sleeper player objects ──────────────
      // Replaces the hardcoded 2024 byeMap in tradeFinder.js.
      // Sleeper's /v1/players/nfl response includes bye_week on each player.
      const byeWeekMap       = NFLScheduleService.buildByeWeekMap(sleeperPlayers);
      const byeWeekMapHealth = NFLScheduleService.validateByeWeekMap(byeWeekMap);
      if (byeWeekMapHealth.missing.length) {
        console.warn(`[GridironIQ] Bye week missing for: ${byeWeekMapHealth.missing.join(", ")}`);
      } else {
        console.info(`[GridironIQ] ✓ Bye weeks loaded for all ${byeWeekMapHealth.covered} teams (source: ${byeWeekMapHealth.source})`);
      }

      // ── Phase 1: Player identity crosswalk ────────────────────────────────
      // Seeds canonical IDs for every live Sleeper player.
      initialiseCrosswalk(sleeperPlayers);
      logCrosswalkReport();

      // ── Phase 2: Load historical artifact (non-blocking) ──────────────────
      // Runs in parallel with the player filter/sort below; awaited before join.
      const historicalLoadPromise = loadHistoricalArtifact();

      const fetchedAt = Date.now();

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
          // D/ST entries: Sleeper DEF records have first_name/last_name but no full_name.
          // team is always present for all 32 NFL teams — use that as the guard.
          if (p.position === "DST") return !!p.team;

          // Skill players and kickers: must have a name and relevant position
          if (!p.full_name) return false;
          if (!RELEVANT.includes(p.position)) return false;

          // Explicitly retired/suspended players are excluded
          if (p.status && EXCLUDE_STATUSES.has(p.status)) return false;

          // Keep if on an active NFL roster — covers starters, backups, IR, PS, PUP.
          if (p.team) return true;

          // Keep unsigned/free-agent players only when Sleeper's search_rank is
          // <= 500 AND status is still "Active". This drops Sleeper-confirmed
          // retired/inactive players (status="Inactive" or "Injured Reserve"
          // with no team) while preserving genuine free agents likely to sign
          // mid-season (e.g. Keenan Allen, Ezekiel Elliott).
          return p.search_rank != null && p.search_rank <= 500 && p.status === "Active";
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
          byeWeekMap,
        );
        player.news = player.news.map(n => ({
          ...n,
          waiver: n.waiver || (trendingIds.has(pid) && (player.owned || 0) < 60),
        }));
        return player;
      });

      enriched.sort((a, b) => b.ppg - a.ppg);

      // ── Phase 2: Join historical 2024 data onto each player ───────────────
      // Awaited here — the fetch began above in parallel with filter/sort work.
      await historicalLoadPromise;

      const historicalByPos = { QB: { matched: 0, total: 0 }, RB: { matched: 0, total: 0 }, WR: { matched: 0, total: 0 }, TE: { matched: 0, total: 0 }, K: { matched: 0, total: 0 }, DST: { matched: 0, total: 0 } };
      let historicalMatched = 0;

      enriched.forEach(p => {
        // Compute canonical_id matching the artifact's key scheme:
        //   DST  → "giq:dst:{TEAM}"   (mirrors buildCanonicalId("dst", team))
        //   Skill → "giq:{player_id}" (mirrors buildCanonicalId("skill", id))
        const canonId = p.pos === "DST"
          ? `giq:dst:${(p.team || "").toUpperCase()}`
          : `giq:${p.id}`;

        const hist = lookupHistorical(canonId);

        if (historicalByPos[p.pos]) historicalByPos[p.pos].total++;

        if (hist) {
          historicalMatched++;
          if (historicalByPos[p.pos]) historicalByPos[p.pos].matched++;

          p.historical2024    = hist;
          p.fantasyPoints2024 = hist.fantasy_points_ppr  ?? null;
          p.ppg2024           = hist.ppg_ppr             ?? null;
          p.finish2024        = hist.overall_finish       ?? null;
          p.positionFinish2024= hist.position_finish      ?? null;
        } else {
          p.historical2024    = null;
          p.fantasyPoints2024 = null;
          p.ppg2024           = null;
          p.finish2024        = null;
          p.positionFinish2024= null;
        }
      });

      const historicalCoverage = logHistoricalCoverageReport(
        enriched, enriched.length, historicalMatched, historicalByPos
      );

      // ── DEBUG: Phase 2 summary (temporary — remove when UI is built) ──────
      console.group("[GridironIQ] Phase 2 Historical Integration — Debug Summary");
      console.info(`  Total players in pool : ${historicalCoverage.totalPool}`);
      console.info(`  Historical matches    : ${historicalCoverage.matched}`);
      console.info(`  Historical coverage   : ${historicalCoverage.coveragePct}%`);
      console.info(`  Unmatched             : ${historicalCoverage.unmatched}`);
      const sampleWithHist = enriched.filter(p => p.historical2024).slice(0, 3);
      if (sampleWithHist.length) {
        console.info("  Sample matched players:");
        sampleWithHist.forEach(p => {
          console.info(`    ${p.name} (${p.pos}) — 2024: ${p.fantasyPoints2024?.toFixed(1) ?? "n/a"} pts, ppg ${p.ppg2024?.toFixed(1) ?? "n/a"}, pos#${p.positionFinish2024 ?? "n/a"}`);
        });
      }
      console.groupEnd();

      // ── ADP Ranking Pass ───────────────────────────────────────────────────
      // This is the single authoritative pass that assigns:
      //   overallRank  — unique 1..N across all positions, sorted by ADP then ppg
      //   posRank      — unique 1..N within each position group
      //   adp          — guaranteed non-null and unique (backfilled from overallRank)
      //
      // Sort order for ranking:
      //   1. FC-sourced ADP first (real draft pick numbers), ascending
      //   2. Estimated ADP next (positional tier fallback), ascending
      //   3. No-ADP players last, sorted by ppg descending
      //   4. Tiebreak within same ADP: higher ppg = better rank

      enriched.sort((a, b) => {
        const aHasReal = a.adpSource === "fantasycalc_rank";
        const bHasReal = b.adpSource === "fantasycalc_rank";
        const aHasEst  = a.adp != null;
        const bHasEst  = b.adp != null;

        // FC-sourced before estimated before null
        if (aHasReal !== bHasReal) return aHasReal ? -1 : 1;
        if (aHasEst  !== bHasEst)  return aHasEst  ? -1 : 1;

        // Both have ADP: ascending pick number, tiebreak by ppg desc
        if (a.adp != null && b.adp != null) {
          if (a.adp !== b.adp) return a.adp - b.adp;
          return b.ppg - a.ppg;
        }

        // Both have no ADP: descending ppg
        return b.ppg - a.ppg;
      });

      // Assign unique overallRank and posRank; backfill ADP from overallRank
      const posRankCounters = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 };
      // Track last seen ADP per position to ensure unique positional ADP
      const lastPosAdp = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 };

      enriched.forEach((p, idx) => {
        const overallRank = idx + 1;
        p.overallRank = overallRank;

        if (posRankCounters[p.pos] !== undefined) {
          posRankCounters[p.pos]++;
          p.posRank = posRankCounters[p.pos];
        } else {
          p.posRank = 1;
        }

        // Guarantee unique ADP: if null or duplicate, derive from overallRank
        // This ensures the Draft Assistant has a clean 1..N ordering
        if (p.adp == null) {
          // Use overallRank directly as ADP for unranked players (they sort last)
          p.adp       = overallRank + 0.1; // +0.1 distinguishes from exact FC picks
          p.adpSource = "derived";
        }
        // Ensure positional ADP is also unique: must exceed last seen for this pos
        if (p.positionalAdp == null) {
          p.positionalAdp = p.posRank + 0.1;
        }
      });

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

      setState({ players: enriched, loading: false, error: null, source: "live", counts, historicalCoverage });

      // ── Data Health Report ─────────────────────────────────────────────
      const healthReport = computeDataHealth(enriched, {
        fetchedAt, season, week, byeWeekMapHealth,
      });
      logHealthReport(healthReport);
      setState(s => ({ ...s, health: healthReport }));
    } catch (err) {
      console.error("[GridironIQ] load error:", err);
      setState(s => ({ ...s, loading: false, error: err.message, source: "error" }));
    }
  }, [scoring, isSuperflex]);

  useEffect(() => { load(); }, [load]);

  return { ...state, refresh: load };
}
