import { SleeperService } from "@/lib/services/sleeper";
import { AIExplanationEngine } from "@/lib/engines/aiExplanation";
import { CURRENT_SEASON, defRankToGrade, defRankToLabel } from "@/lib/constants";

export const PlayerIntelligence = {
  compute(sleeperPlayer, weeklyScores = [], projData = null, fcValue = null, defRanksByPos = {}, scoring = "PPR", nextOpp = null, positionalRank = null) {
    const sp  = sleeperPlayer;
    const pos = sp.position || sp.fantasy_positions?.[0] || "?";

    // ── Route DST and K to specialized compute paths ──────────────────────
    if (pos === "DST") return this._computeDST(sp, weeklyScores, projData, fcValue, defRanksByPos, positionalRank);
    if (pos === "K")   return this._computeK(sp, weeklyScores, projData, fcValue, defRanksByPos, positionalRank);

    // ── Skill player path (QB / RB / WR / TE) ────────────────────────────
    const team = sp.team || sp.fantasy_team || "FA";
    const injStatus = sp.injury_status || null;

    const scores = weeklyScores.filter(s => s != null && !isNaN(s));
    const avg = n => scores.length >= n
      ? scores.slice(-n).reduce((a, b) => a + b, 0) / n
      : scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

    const seasonAvg = avg(scores.length);
    const last4Avg  = avg(4);
    const last8Avg  = avg(8);
    const trendPct  = last8Avg > 0 ? ((last4Avg - last8Avg) / last8Avg) * 100 : 0;
    const trendDir  = trendPct > 8 ? "up" : trendPct < -8 ? "down" : "same";

    const oppScore = Math.min(100, Math.round(
      (seasonAvg / this._posBaseline(pos)) * 50 +
      (trendDir === "up" ? 15 : trendDir === "down" ? -10 : 5) +
      (scores.length >= 8 ? 10 : scores.length >= 4 ? 5 : 0) +
      (injStatus ? -20 : 15)
    ));

    const mean   = seasonAvg;
    const stddev = scores.length > 1
      ? Math.sqrt(scores.reduce((s, v) => s + (v - mean) ** 2, 0) / scores.length)
      : mean * 0.4;
    const cv = mean > 0 ? stddev / mean : 1;
    const consistencyScore = Math.min(100, Math.max(0, Math.round((1 - cv) * 100)));

    const boomThresh = pos === "QB" ? 35 : 30;
    const bustThresh = pos === "QB" ? 18 : 10;
    const boomPct = scores.length ? Math.round((scores.filter(s => s >= boomThresh).length / scores.length) * 100) : 0;
    const bustPct = scores.length ? Math.round((scores.filter(s => s <= bustThresh).length / scores.length) * 100) : 0;

    const posDefRanks  = defRanksByPos[pos] || {};
    const oppTeam      = nextOpp || null;
    const rawDefRank   = oppTeam ? (posDefRanks[oppTeam] || 16) : 16;
    const matchupGrade = oppTeam ? defRankToGrade(rawDefRank) : "C";
    const matchupLabel = oppTeam ? defRankToLabel(rawDefRank) : "Neutral";
    const keyStats     = oppTeam ? [
      `#${rawDefRank} def vs ${pos}`,
      `${matchupGrade === "A" ? "Vulnerable" : matchupGrade === "D" ? "Elite" : "Average"} coverage`,
      `${trendDir === "up" ? "Hot streak" : trendDir === "down" ? "Cold stretch" : "Steady"} last 4 gms`,
    ] : [];

    const sosScore        = oppTeam ? Math.round((rawDefRank / 32) * 100) : 50;
    const playoffSosScore = sosScore;

    const injMap = { Out: 10, Doubtful: 25, Questionable: 60, IR: 5 };
    const injuryRiskScore = injMap[injStatus] ?? (injStatus ? 50 : 90);

    const ppg  = projData
      ? parseFloat(SleeperService.calcPPG(projData, scoring).toFixed(1))
      : parseFloat(seasonAvg.toFixed(1));

    // ── ADP from FantasyCalc (real pick numbers, not trade values) ────────
    // fcValue.adp     = overallPick  — mean overall pick number across drafts
    // fcValue.positionalAdp          — positional rank (e.g. RB3 = 3.4)
    // fcValue.adpTrend               — "rising" | "falling" | "stable" | null
    // fcValue.adpDelta               — pick movement (negative = rising)
    const adp           = fcValue?.adp           ?? null;
    const positionalAdp = fcValue?.positionalAdp ?? null;
    const adpTrend      = fcValue?.adpTrend      ?? null;
    const adpDelta      = fcValue?.adpDelta      ?? null;
    const fcVal         = fcValue?.redraftValue  ?? null;

    // ── Fallback ADP when player is not in FantasyCalc ────────────────────
    // Use the player's positional rank within the already-sorted player array
    // to estimate ADP via positional tier tables.
    const fallbackAdp = (adp === null && positionalRank)
      ? this._positionalAdpFallback(pos, positionalRank)
      : null;

    const resolvedAdp = adp ?? fallbackAdp;

    const aiRec = AIExplanationEngine.generate({
      name: sp.full_name || sp.first_name + " " + sp.last_name,
      pos, team, ppg, seasonAvg, last4Avg, last8Avg,
      trendDir, trendPct, oppScore, consistencyScore,
      boomPct, bustPct, sosScore, playoffSosScore, injuryRiskScore,
      matchupGrade, rawDefRank, oppTeam, adp: resolvedAdp, fcVal, injStatus, scores,
    });

    const injury = injStatus === "Out" ? "OUT"
      : injStatus === "IR" ? "IR"
      : injStatus === "Questionable" || injStatus === "Doubtful" ? "Q"
      : null;

    return {
      id:              sp.player_id || sp.sleeper_id,
      sleeperPlayerId: sp.player_id,
      name:            sp.full_name || `${sp.first_name || ""} ${sp.last_name || ""}`.trim(),
      pos, team, ppg,
      // ADP: real pick number from FantasyCalc, or positional estimate, or null
      adp:             resolvedAdp,
      adpSource:       adp !== null ? "fantasycalc" : fallbackAdp !== null ? "estimated" : null,
      positionalAdp,
      adpTrend,   // "rising" | "falling" | "stable" | null
      adpDelta,   // raw pick-number movement
      trend:           trendDir,
      injury,
      owned:           Math.round(sp.ownership_pct ?? 0),
      seasonAvg:       parseFloat(seasonAvg.toFixed(2)),
      last4Avg:        parseFloat(last4Avg.toFixed(2)),
      last8Avg:        parseFloat(last8Avg.toFixed(2)),
      trendPct:        parseFloat(trendPct.toFixed(1)),
      opportunityScore: Math.max(0, Math.min(100, oppScore)),
      consistencyScore,
      boomPct, bustPct, sosScore, playoffSosScore, injuryRiskScore,
      fcValue:         fcVal,
      history:         this._buildHistory(scores),
      matchup: oppTeam ? {
        opp: oppTeam, grade: matchupGrade, label: matchupLabel,
        defRank: rawDefRank,
        summary: AIExplanationEngine.matchupSummary({ name: sp.full_name, pos, oppTeam, rawDefRank, matchupGrade, trendDir }),
        keyStats,
      } : null,
      strengths:    aiRec.strengths,
      weaknesses:   aiRec.riskFactors,
      injuryDetail: injStatus ? {
        type:     sp.injury_body_part || injStatus,
        timeline: sp.injury_notes || sp.injury_start_date || "Monitor status",
        detail:   sp.injury_notes || `Listed as ${injStatus}. Check practice reports before starting.`,
        status:   injury,
      } : null,
      news:            this._buildNews(sp, injStatus),
      aiRecommendation: aiRec,
    };
  },

  _posBaseline(pos) {
    return { QB: 22, RB: 16, WR: 14, TE: 10, K: 8, DST: 8 }[pos] || 12;
  },

  // ── D/ST compute path ───────────────────────────────────────────────────
  _computeDST(sp, weeklyScores, projData, fcValue, defRanksByPos, positionalRank) {
    const scores    = weeklyScores.filter(s => s != null && !isNaN(s));
    const avg       = n => scores.length >= n
      ? scores.slice(-n).reduce((a, b) => a + b, 0) / n
      : scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

    const seasonAvg = avg(scores.length);
    const last4Avg  = avg(4);
    const last8Avg  = avg(8);
    const trendPct  = last8Avg > 0 ? ((last4Avg - last8Avg) / last8Avg) * 100 : 0;
    const trendDir  = trendPct > 8 ? "up" : trendPct < -8 ? "down" : "same";
    const ppg       = projData ? parseFloat(SleeperService.calcPPG(projData).toFixed(1))
                               : parseFloat(seasonAvg.toFixed(1));

    const team      = sp.team || sp.player_id || "FA";
    const teamName  = sp.full_name || team;

    // DST matchup — offensive rank of opponent (higher = easier matchup)
    const oppTeam      = sp.opponent_abbr || null;
    const rawDefRank   = oppTeam ? (defRanksByPos["QB"]?.[oppTeam] || 16) : 16;
    const matchupGrade = oppTeam ? defRankToGrade(rawDefRank) : "C";
    const matchupLabel = oppTeam ? defRankToLabel(rawDefRank) : "Neutral";

    const sosScore        = oppTeam ? Math.round((rawDefRank / 32) * 100) : 50;
    const playoffSosScore = sosScore;
    const consistencyScore = scores.length > 1 ? (() => {
      const mean   = seasonAvg;
      const stddev = Math.sqrt(scores.reduce((s, v) => s + (v - mean) ** 2, 0) / scores.length);
      const cv     = mean > 0 ? stddev / mean : 1;
      return Math.min(100, Math.max(0, Math.round((1 - cv) * 100)));
    })() : 50;

    const boomPct = scores.length ? Math.round(scores.filter(s => s >= 15).length / scores.length * 100) : 0;
    const bustPct = scores.length ? Math.round(scores.filter(s => s <= 3).length  / scores.length * 100) : 0;

    const adp          = fcValue?.adp          ?? null;
    const positionalAdp= fcValue?.positionalAdp ?? null;
    const adpTrend     = fcValue?.adpTrend      ?? null;
    const adpDelta     = fcValue?.adpDelta      ?? null;
    const fcVal        = fcValue?.redraftValue  ?? null;
    const fallbackAdp  = adp === null && positionalRank
      ? this._positionalAdpFallback("DST", positionalRank) : null;
    const resolvedAdp  = adp ?? fallbackAdp;

    const aiRec = AIExplanationEngine.generate({
      name: teamName, pos: "DST", team, ppg, seasonAvg, last4Avg, last8Avg,
      trendDir, trendPct, oppScore: 50, consistencyScore,
      boomPct, bustPct, sosScore, playoffSosScore, injuryRiskScore: 90,
      matchupGrade, rawDefRank, oppTeam, adp: resolvedAdp, fcVal, injStatus: null, scores,
    });

    return {
      id:              sp.player_id,
      sleeperPlayerId: sp.player_id,
      name:            teamName,
      pos:             "DST",
      team,
      ppg,
      adp:             resolvedAdp,
      adpSource:       adp !== null ? "fantasycalc" : fallbackAdp !== null ? "estimated" : null,
      positionalAdp, adpTrend, adpDelta,
      trend:           trendDir,
      injury:          null,
      owned:           Math.round(sp.ownership_pct ?? 0),
      seasonAvg:       parseFloat(seasonAvg.toFixed(2)),
      last4Avg:        parseFloat(last4Avg.toFixed(2)),
      last8Avg:        parseFloat(last8Avg.toFixed(2)),
      trendPct:        parseFloat(trendPct.toFixed(1)),
      opportunityScore:  50,
      consistencyScore,
      boomPct, bustPct, sosScore, playoffSosScore,
      injuryRiskScore: 90,
      fcValue:         fcVal,
      history:         this._buildHistory(scores),
      matchup: oppTeam ? {
        opp: oppTeam, grade: matchupGrade, label: matchupLabel,
        defRank: rawDefRank,
        summary: `${teamName} faces ${oppTeam} (#${rawDefRank} offense). ${matchupGrade === "A" ? "Excellent" : matchupGrade === "B" ? "Good" : matchupGrade === "C" ? "Average" : "Tough"} matchup for DST.`,
        keyStats: [`#${rawDefRank} offense vs ${teamName}`, matchupLabel],
      } : null,
      strengths:       aiRec.strengths,
      weaknesses:      aiRec.riskFactors,
      injuryDetail:    null,
      news:            [{ text: `${teamName} D/ST — active and healthy.`, source: "sleeper", urgency: "normal", waiver: false }],
      aiRecommendation: aiRec,
    };
  },

  // ── Kicker compute path ─────────────────────────────────────────────────
  _computeK(sp, weeklyScores, projData, fcValue, defRanksByPos, positionalRank) {
    const scores    = weeklyScores.filter(s => s != null && !isNaN(s));
    const avg       = n => scores.length >= n
      ? scores.slice(-n).reduce((a, b) => a + b, 0) / n
      : scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

    const seasonAvg = avg(scores.length);
    const last4Avg  = avg(4);
    const last8Avg  = avg(8);
    const trendPct  = last8Avg > 0 ? ((last4Avg - last8Avg) / last8Avg) * 100 : 0;
    const trendDir  = trendPct > 8 ? "up" : trendPct < -8 ? "down" : "same";
    const ppg       = projData ? parseFloat(SleeperService.calcPPG(projData).toFixed(1))
                               : parseFloat(seasonAvg.toFixed(1));

    const team      = sp.team || "FA";
    const name      = sp.full_name || `${sp.first_name || ""} ${sp.last_name || ""}`.trim();
    const injStatus = sp.injury_status || null;

    const oppTeam      = sp.opponent_abbr || null;
    const rawDefRank   = oppTeam ? (defRanksByPos["K"]?.[oppTeam] || 16) : 16;
    const matchupGrade = oppTeam ? defRankToGrade(rawDefRank) : "C";
    const matchupLabel = oppTeam ? defRankToLabel(rawDefRank) : "Neutral";
    const sosScore     = oppTeam ? Math.round((rawDefRank / 32) * 100) : 50;

    const consistencyScore = scores.length > 1 ? (() => {
      const mean   = seasonAvg;
      const stddev = Math.sqrt(scores.reduce((s, v) => s + (v - mean) ** 2, 0) / scores.length);
      const cv     = mean > 0 ? stddev / mean : 1;
      return Math.min(100, Math.max(0, Math.round((1 - cv) * 100)));
    })() : 50;

    const boomPct = scores.length ? Math.round(scores.filter(s => s >= 12).length / scores.length * 100) : 0;
    const bustPct = scores.length ? Math.round(scores.filter(s => s <= 3).length  / scores.length * 100) : 0;

    const injMap    = { Out: 10, Doubtful: 25, Questionable: 60, IR: 5 };
    const injuryRiskScore = injMap[injStatus] ?? (injStatus ? 50 : 90);

    const adp          = fcValue?.adp          ?? null;
    const positionalAdp= fcValue?.positionalAdp ?? null;
    const adpTrend     = fcValue?.adpTrend      ?? null;
    const adpDelta     = fcValue?.adpDelta      ?? null;
    const fcVal        = fcValue?.redraftValue  ?? null;
    const fallbackAdp  = adp === null && positionalRank
      ? this._positionalAdpFallback("K", positionalRank) : null;
    const resolvedAdp  = adp ?? fallbackAdp;

    const injury = injStatus === "Out" ? "OUT"
      : injStatus === "IR" ? "IR"
      : injStatus === "Questionable" || injStatus === "Doubtful" ? "Q"
      : null;

    const aiRec = AIExplanationEngine.generate({
      name, pos: "K", team, ppg, seasonAvg, last4Avg, last8Avg,
      trendDir, trendPct, oppScore: 50, consistencyScore,
      boomPct, bustPct, sosScore, playoffSosScore: sosScore, injuryRiskScore,
      matchupGrade, rawDefRank, oppTeam, adp: resolvedAdp, fcVal, injStatus, scores,
    });

    return {
      id:              sp.player_id,
      sleeperPlayerId: sp.player_id,
      name,
      pos:             "K",
      team,
      ppg,
      adp:             resolvedAdp,
      adpSource:       adp !== null ? "fantasycalc" : fallbackAdp !== null ? "estimated" : null,
      positionalAdp, adpTrend, adpDelta,
      trend:           trendDir,
      injury,
      owned:           Math.round(sp.ownership_pct ?? 0),
      seasonAvg:       parseFloat(seasonAvg.toFixed(2)),
      last4Avg:        parseFloat(last4Avg.toFixed(2)),
      last8Avg:        parseFloat(last8Avg.toFixed(2)),
      trendPct:        parseFloat(trendPct.toFixed(1)),
      opportunityScore:  50,
      consistencyScore,
      boomPct, bustPct, sosScore, playoffSosScore: sosScore,
      injuryRiskScore,
      fcValue:         fcVal,
      history:         this._buildHistory(scores),
      matchup: oppTeam ? {
        opp: oppTeam, grade: matchupGrade, label: matchupLabel, defRank: rawDefRank,
        summary: `${name} faces ${oppTeam}. ${matchupLabel} for kickers.`,
        keyStats: [`${matchupLabel} matchup`, `#${rawDefRank} vs K`],
      } : null,
      strengths:       aiRec.strengths,
      weaknesses:      aiRec.riskFactors,
      injuryDetail:    injury ? {
        type: injStatus, timeline: sp.injury_notes || "Monitor status",
        detail: `${name} listed as ${injStatus}.`, status: injury,
      } : null,
      news:            this._buildNews(sp, injStatus),
      aiRecommendation: aiRec,
    };
  },

  _positionalAdpFallback(pos, positionalRank) {
    if (!positionalRank || positionalRank < 1) return null;
    const tables = {
      QB:  [25, 55, 80, 110, 140, 170, 200],
      RB:  [5,  15, 28, 42,  58,  75,  95, 115, 140, 165, 190],
      WR:  [8,  18, 32, 46,  60,  76,  92, 110, 130, 152, 175],
      TE:  [18, 55, 80, 110, 145, 175, 205],
      K:   [155, 165, 175, 185, 195, 205],
      DST: [60,  80, 100, 120, 140, 160, 175, 190, 200, 210],
    };
    const table = tables[pos];
    if (!table) return null;
    const idx = Math.min(positionalRank - 1, table.length - 1);
    return table[idx];
  },

  _buildHistory(scores) {
    if (!scores.length) return [];
    const chunks = [];
    const prev = scores.slice(0, Math.max(0, scores.length - 17));
    const curr = scores.slice(-17);
    if (prev.length) {
      const prevAvg = prev.reduce((a, b) => a + b, 0) / prev.length;
      chunks.push({ yr: CURRENT_SEASON - 1, ppg: parseFloat(prevAvg.toFixed(1)) });
    }
    if (curr.length) {
      const currAvg = curr.reduce((a, b) => a + b, 0) / curr.length;
      chunks.push({ yr: CURRENT_SEASON, ppg: parseFloat(currAvg.toFixed(1)) });
    }
    return chunks;
  },

  _buildNews(sp, injStatus) {
    const news = [];
    if (injStatus) {
      news.push({
        text:    sp.injury_notes || `${sp.full_name} listed as ${injStatus}. Monitor practice reports.`,
        source:  "nfl",
        urgency: injStatus === "Out" || injStatus === "IR" ? "breaking" : "high",
        waiver:  injStatus === "Out" || injStatus === "IR",
      });
    } else {
      news.push({
        text:    `${sp.full_name} — no injury designation. Active and practicing.`,
        source:  "sleeper",
        urgency: "normal",
        waiver:  false,
      });
    }
    return news;
  },
};

export function computeDefensiveRankings(weeklyStatsArray, sleeperPlayers) {
  const fallbackRanks = {};
  const positions = ["QB", "RB", "WR", "TE"];
  const NFL_TEAMS = [
    "ARI","ATL","BAL","BUF","CAR","CHI","CIN","CLE","DAL","DEN",
    "DET","GB","HOU","IND","JAX","KC","LAC","LAR","LV","MIA",
    "MIN","NE","NO","NYG","NYJ","PHI","PIT","SEA","SF","TB","TEN","WAS",
  ];
  positions.forEach(p => {
    fallbackRanks[p] = {};
    const shuffled = [...NFL_TEAMS].sort(() => Math.sin(p.charCodeAt(0) * 17) - 0.3);
    shuffled.forEach((team, idx) => { fallbackRanks[p][team] = idx + 1; });
  });
  return fallbackRanks;
}
