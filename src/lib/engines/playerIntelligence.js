import { SleeperService } from "@/lib/services/sleeper";
import { AIExplanationEngine } from "@/lib/engines/aiExplanation";
import { CURRENT_SEASON, defRankToGrade, defRankToLabel } from "@/lib/constants";

export const PlayerIntelligence = {
  compute(sleeperPlayer, weeklyScores = [], projData = null, fcValue = null, defRanksByPos = {}, scoring = "PPR", nextOpp = null, positionalRank = null, byeWeekMap = {}, fetchedAt = {}, seasonStarted = true) {
    const sp  = sleeperPlayer;
    const pos = sp.position || sp.fantasy_positions?.[0] || "?";

    // ── Route DST and K to specialized compute paths ──────────────────────
    if (pos === "DST") return this._computeDST(sp, weeklyScores, projData, fcValue, defRanksByPos, positionalRank, byeWeekMap, fetchedAt);
    if (pos === "K")   return this._computeK(sp, weeklyScores, projData, fcValue, defRanksByPos, positionalRank, byeWeekMap, fetchedAt);

    // ── Skill player path (QB / RB / WR / TE) ────────────────────────────
    const team = sp.team || sp.fantasy_team || "FA";
    const injStatus = sp.injury_status || null;
    // Offseason surgical-recovery tags (Sleeper carries these through the entire offseason).
    // These are NOT active game-week injury concerns — treat as informational only.
    const isOffseasonInjury = injStatus ? this._isOffseasonInjury(sp) : false;

    const scores = weeklyScores.filter(s => s != null && !isNaN(s));
    const avg = n => scores.length >= n
      ? scores.slice(-n).reduce((a, b) => a + b, 0) / n
      : scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

    const seasonAvg = avg(scores.length);
    const last4Avg  = avg(4);
    const last8Avg  = avg(8);
    const trendPct  = last8Avg > 0 ? ((last4Avg - last8Avg) / last8Avg) * 100 : 0;
    const trendDir  = trendPct > 8 ? "up" : trendPct < -8 ? "down" : "same";

    // Tiered opportunity-score injury adjustment — calibrated to actual play-rates:
    //   Healthy        +15  (bonus for no designation)
    //   Recovery (REC)   0  (offseason surgical tag; player expected to play week 1)
    //   Questionable    -5  (~75-80% play rate — small caution only)
    //   Doubtful       -15  (~50% play rate — significant concern)
    //   Out / IR / other -20 (confirmed absence)
    const injOppAdj = !injStatus                          ? 15
      : isOffseasonInjury                                 ? 0
      : injStatus === "Questionable"                      ? -5
      : injStatus === "Doubtful"                          ? -15
      : -20;

    const oppScore = Math.min(100, Math.round(
      (seasonAvg / this._posBaseline(pos)) * 50 +
      (trendDir === "up" ? 15 : trendDir === "down" ? -10 : 5) +
      (scores.length >= 8 ? 10 : scores.length >= 4 ? 5 : 0) +
      injOppAdj
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
    const playoffSosScore = defRanksByPos[pos] ? Math.round(((32 - (defRanksByPos[pos][team] || 16)) / 31) * 94 + 3) : sosScore;

    // injuryRiskScore (0–100): higher = safer to start.
    // Recalibrated to reflect actual game-day play rates:
    //   Healthy: 90 | REC: 85 | Q: 78 | PUP: 45 | Doubtful: 35 | Out: 10 | IR: 5
    const injMap = { Out: 10, IR: 5, Doubtful: 35, Questionable: 78, PUP: 45 };
    const injuryRiskScore = isOffseasonInjury ? 85
      : (injMap[injStatus] ?? (injStatus ? 50 : 90));

    const ppg  = projData
      ? parseFloat(SleeperService.calcPPG(projData, scoring).toFixed(1))
      : parseFloat(seasonAvg.toFixed(1));
    const ppgSource = projData   ? "sleeper_proj"
                    : seasonAvg > 0 ? "season_avg"
                    : "pos_estimate";

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

    // ── Freshness metadata ─────────────────────────────────────────────────
    const _now = Date.now();
    const _ageMin = ts => ts ? Math.round((_now - ts) / 60_000) : null;
    const injuryAgeMinutes     = _ageMin(fetchedAt.players);
    const projectionAgeMinutes = _ageMin(fetchedAt.projections);
    const opponentAgeMinutes   = _ageMin(fetchedAt.players);
    const newsAgeMinutes       = _ageMin(fetchedAt.players);

    const staleFlags = [];
    const STALE_THRESHOLD_MIN = 30;
    if (projectionAgeMinutes != null && projectionAgeMinutes > STALE_THRESHOLD_MIN) staleFlags.push("stale_projection");
    if (injuryAgeMinutes     != null && injuryAgeMinutes     > STALE_THRESHOLD_MIN) staleFlags.push("stale_injury");
    if (!oppTeam)                                                                    staleFlags.push("missing_opponent");

    const _live = {
      injuryAgeMinutes,
      projectionAgeMinutes,
      newsAgeMinutes,
      opponentAgeMinutes,
      lastRefresh: fetchedAt.players ? new Date(fetchedAt.players).toISOString() : null,
      staleFlags,
    };

    const aiRec = AIExplanationEngine.generate({
      name: sp.full_name || sp.first_name + " " + sp.last_name,
      pos, team, ppg, seasonAvg, last4Avg, last8Avg,
      trendDir, trendPct, opportunityScore: oppScore, consistencyScore,
      boomPct, bustPct, sosScore, playoffSosScore, bye: byeWeekMap[sp.team] || sp.bye_week || null, injuryRiskScore,
      matchupGrade, rawDefRank, oppTeam, adp: resolvedAdp, fcVal, injStatus, scores,
      staleFlags, seasonStarted,
    });

    // Badge values — each maps to a distinct colour in InjuryBadge:
    //   OUT red | IR purple | D orange | Q yellow | PUP slate | REC blue (offseason recovery)
    const injury = injStatus === "Out"          ? "OUT"
      : injStatus === "IR"                      ? "IR"
      : injStatus === "PUP"                     ? "PUP"
      : injStatus === "Doubtful"                ? "D"
      : (injStatus === "Questionable" && isOffseasonInjury) ? "REC"
      : injStatus === "Questionable"            ? "Q"
      : null;

    return {
      id:              sp.player_id || sp.sleeper_id,
      sleeperPlayerId: sp.player_id,
      name:            sp.full_name || `${sp.first_name || ""} ${sp.last_name || ""}`.trim(),
      pos, team, ppg, ppgSource,
      // ADP: real pick number from FantasyCalc, or positional estimate, or null
      adp:             resolvedAdp,
      adpSource:       adp !== null ? "fantasycalc_rank" : fallbackAdp !== null ? "estimated" : null,
      positionalAdp,
      adpTrend,   // "rising" | "falling" | "stable" | null
      adpDelta,   // raw pick-number movement
      trend:           trendDir,
      injury,
      seasonAvg:       parseFloat(seasonAvg.toFixed(2)),
      last4Avg:        parseFloat(last4Avg.toFixed(2)),
      last8Avg:        parseFloat(last8Avg.toFixed(2)),
      trendPct:        parseFloat(trendPct.toFixed(1)),
      opportunityScore: Math.max(0, Math.min(100, oppScore)),
      consistencyScore,
      boomPct, bustPct, sosScore, playoffSosScore, bye: byeWeekMap[sp.team] || sp.bye_week || null, injuryRiskScore,
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
      news:            this._buildNews(sp, injStatus, fetchedAt.players),
      _live,
      aiRecommendation: aiRec,
      _debug: {
        projectionSource:         ppgSource,
        matchupSource:            oppTeam ? "sleeper_opponent_abbr" : "no_opponent_data",
        historicalWeeksUsed:      scores.length,
        missingOpponent:          !oppTeam,
        missingProjection:        !projData,
        missingStats:             scores.length === 0,
        injurySource:             injStatus ? "sleeper_player_data" : null,
        injuryStatus:             injStatus,
        injuryPenaltyApplied:     injStatus ? (isOffseasonInjury ? "offseason_recovery" : injStatus) : "none",
        offseasonInjuryDetected:  isOffseasonInjury,
        staleFlags,
        newsSource:               "sleeper_player_data",
        confidenceInputs: {
          baseline:          50,
          opportunityContrib: Math.round(Math.max(0, Math.min(100, oppScore)) * 0.3 * 10) / 10,
          consistencyContrib: Math.round(consistencyScore * 0.15 * 10) / 10,
          boomBustContrib:    Math.round((boomPct - bustPct) * 0.2 * 10) / 10,
          injuryDiscount:    -Math.round((100 - injuryRiskScore) * 0.3 * 10) / 10,
        },
        penalties: aiRec._penalties || [],
        bonuses:   aiRec._bonuses   || [],
      },
    };
  },

  _posBaseline(pos) {
    return { QB: 22, RB: 16, WR: 14, TE: 10, K: 8, DST: 8 }[pos] || 12;
  },

  // Returns true when injury_notes/injury_body_part indicate a post-surgery offseason
  // recovery that Sleeper carries forward as "Questionable" rather than a game-week tag.
  _isOffseasonInjury(sp) {
    const notes = (sp.injury_notes        || "").toLowerCase();
    const part  = (sp.injury_body_part    || "").toLowerCase();
    const KEYWORDS = ["surgery", "acl", "rehab", "recovery", "physically unable", "pup"];
    return KEYWORDS.some(kw => notes.includes(kw) || part.includes(kw));
  },

  // ── D/ST compute path ───────────────────────────────────────────────────
  _computeDST(sp, weeklyScores, projData, fcValue, defRanksByPos, positionalRank, byeWeekMap = {}, fetchedAt = {}) {
    const scores    = weeklyScores.filter(s => s != null && !isNaN(s));
    const avg       = n => scores.length >= n
      ? scores.slice(-n).reduce((a, b) => a + b, 0) / n
      : scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

    const seasonAvg = avg(scores.length);
    const last4Avg  = avg(4);
    const last8Avg  = avg(8);
    const trendPct  = last8Avg > 0 ? ((last4Avg - last8Avg) / last8Avg) * 100 : 0;
    const trendDir  = trendPct > 8 ? "up" : trendPct < -8 ? "down" : "same";
    // Projection priority: Sleeper proj → season avg → positional estimate (never 0)
    // Elite DSTs average ~9 pts/wk, average ~7 pts/wk, streaming options ~5
    const _dstProj = projData ? parseFloat(SleeperService.calcPPG(projData).toFixed(1)) : null;
    const ppg = (_dstProj !== null && _dstProj > 0)
      ? _dstProj
      : seasonAvg > 0
      ? parseFloat(seasonAvg.toFixed(1))
      : parseFloat(Math.max(4, 8.5 - (positionalRank ? (positionalRank - 1) * 0.12 : 0)).toFixed(1));
    const ppgSource = (_dstProj !== null && _dstProj > 0) ? "sleeper_proj"
                    : seasonAvg > 0                        ? "season_avg"
                    : "pos_estimate";

    const team      = sp.team || sp.player_id || "FA";
    const teamName  = sp.full_name || team;

    // DST matchup — how many fantasy pts has the opponent's offense allowed DSTs to score?
    // Rank 1 = opponent allows most DST pts = easiest matchup for our DST
    const oppTeam      = sp.opponent_abbr || null;
    const rawDefRank   = oppTeam ? (defRanksByPos["DST"]?.[oppTeam] || 16) : 16;
    const matchupGrade = oppTeam ? defRankToGrade(rawDefRank) : "C";
    const matchupLabel = oppTeam ? defRankToLabel(rawDefRank) : "Neutral";

    const sosScore        = oppTeam ? Math.round((rawDefRank / 32) * 100) : 50;
    const playoffSosScore = defRanksByPos["DST"] ? Math.round(((32 - (defRanksByPos["DST"][team] || 16)) / 31) * 94 + 3) : sosScore;
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
      trendDir, trendPct, opportunityScore: 50, consistencyScore,
      boomPct, bustPct, sosScore, playoffSosScore, bye: byeWeekMap[sp.team] || sp.bye_week || null, injuryRiskScore: 90,
      matchupGrade, rawDefRank, oppTeam, adp: resolvedAdp, fcVal, injStatus: null, scores,
    });

    return {
      id:              sp.player_id,
      sleeperPlayerId: sp.player_id,
      name:            teamName,
      pos:             "DST",
      team,
      ppg, ppgSource,
      adp:             resolvedAdp,
      adpSource:       adp !== null ? "fantasycalc_rank" : fallbackAdp !== null ? "estimated" : null,
      positionalAdp, adpTrend, adpDelta,
      trend:           trendDir,
      injury:          null,
      seasonAvg:       parseFloat(seasonAvg.toFixed(2)),
      last4Avg:        parseFloat(last4Avg.toFixed(2)),
      last8Avg:        parseFloat(last8Avg.toFixed(2)),
      trendPct:        parseFloat(trendPct.toFixed(1)),
      opportunityScore:  50,
      consistencyScore,
      boomPct, bustPct, sosScore, playoffSosScore, bye: byeWeekMap[sp.team] || sp.bye_week || null,
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
      news:            [{ headline: `${teamName} D/ST — active and healthy.`, text: `${teamName} D/ST — active and healthy.`, timestamp: fetchedAt.players || Date.now(), source: "sleeper", severity: "INFO", urgency: "normal", waiver: false }],
      _live: {
        injuryAgeMinutes:    fetchedAt.players    ? Math.round((Date.now() - fetchedAt.players)    / 60_000) : null,
        projectionAgeMinutes:fetchedAt.projections ? Math.round((Date.now() - fetchedAt.projections) / 60_000) : null,
        newsAgeMinutes:      fetchedAt.players    ? Math.round((Date.now() - fetchedAt.players)    / 60_000) : null,
        opponentAgeMinutes:  fetchedAt.players    ? Math.round((Date.now() - fetchedAt.players)    / 60_000) : null,
        lastRefresh: fetchedAt.players ? new Date(fetchedAt.players).toISOString() : null,
        staleFlags: [...(!oppTeam ? ["missing_opponent"] : [])],
      },
      aiRecommendation: aiRec,
    };
  },

  // ── Kicker compute path ─────────────────────────────────────────────────
  _computeK(sp, weeklyScores, projData, fcValue, defRanksByPos, positionalRank, byeWeekMap = {}, fetchedAt = {}) {
    const scores    = weeklyScores.filter(s => s != null && !isNaN(s));
    const avg       = n => scores.length >= n
      ? scores.slice(-n).reduce((a, b) => a + b, 0) / n
      : scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

    const seasonAvg = avg(scores.length);
    const last4Avg  = avg(4);
    const last8Avg  = avg(8);
    const trendPct  = last8Avg > 0 ? ((last4Avg - last8Avg) / last8Avg) * 100 : 0;
    const trendDir  = trendPct > 8 ? "up" : trendPct < -8 ? "down" : "same";
    // Projection priority: Sleeper proj → season avg → positional estimate (never 0)
    // Elite kickers average ~9 pts/wk, average ~7 pts/wk
    const _kProj = projData ? parseFloat(SleeperService.calcPPG(projData).toFixed(1)) : null;
    const ppg = (_kProj !== null && _kProj > 0)
      ? _kProj
      : seasonAvg > 0
      ? parseFloat(seasonAvg.toFixed(1))
      : parseFloat(Math.max(4, 8.0 - (positionalRank ? (positionalRank - 1) * 0.1 : 0)).toFixed(1));
    const ppgSource = (_kProj !== null && _kProj > 0) ? "sleeper_proj"
                    : seasonAvg > 0                    ? "season_avg"
                    : "pos_estimate";

    const team      = sp.team || "FA";
    const name      = sp.full_name || `${sp.first_name || ""} ${sp.last_name || ""}`.trim();
    const injStatus = sp.injury_status || null;
    const isOffseasonInjury = injStatus ? this._isOffseasonInjury(sp) : false;

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

    const injMap    = { Out: 10, IR: 5, Doubtful: 35, Questionable: 78, PUP: 45 };
    const injuryRiskScore = isOffseasonInjury ? 85
      : (injMap[injStatus] ?? (injStatus ? 50 : 90));

    const adp          = fcValue?.adp          ?? null;
    const positionalAdp= fcValue?.positionalAdp ?? null;
    const adpTrend     = fcValue?.adpTrend      ?? null;
    const adpDelta     = fcValue?.adpDelta      ?? null;
    const fcVal        = fcValue?.redraftValue  ?? null;
    const fallbackAdp  = adp === null && positionalRank
      ? this._positionalAdpFallback("K", positionalRank) : null;
    const resolvedAdp  = adp ?? fallbackAdp;

    const injury = injStatus === "Out"     ? "OUT"
      : injStatus === "IR"                 ? "IR"
      : injStatus === "PUP"               ? "PUP"
      : injStatus === "Doubtful"          ? "D"
      : (injStatus === "Questionable" && isOffseasonInjury) ? "REC"
      : injStatus === "Questionable"      ? "Q"
      : null;

    const _kNow = Date.now();
    const _kAgeMin = ts => ts ? Math.round((_kNow - ts) / 60_000) : null;
    const kInjuryAgeMin  = _kAgeMin(fetchedAt.players);
    const kProjAgeMin    = _kAgeMin(fetchedAt.projections);
    const kStaleFlags = [
      ...(kProjAgeMin != null && kProjAgeMin > 30 ? ["stale_projection"] : []),
      ...(kInjuryAgeMin != null && kInjuryAgeMin > 30 ? ["stale_injury"] : []),
      ...(!oppTeam ? ["missing_opponent"] : []),
    ];

    const aiRec = AIExplanationEngine.generate({
      name, pos: "K", team, ppg, seasonAvg, last4Avg, last8Avg,
      trendDir, trendPct, opportunityScore: 50, consistencyScore,
      boomPct, bustPct, sosScore, playoffSosScore: (defRanksByPos["K"] ? Math.round(((32 - (defRanksByPos["K"][sp.team] || 16)) / 31) * 94 + 3) : sosScore), bye: byeWeekMap[sp.team] || sp.bye_week || null, injuryRiskScore,
      matchupGrade, rawDefRank, oppTeam, adp: resolvedAdp, fcVal, injStatus, scores,
      staleFlags: kStaleFlags,
    });

    return {
      id:              sp.player_id,
      sleeperPlayerId: sp.player_id,
      name,
      pos:             "K",
      team,
      ppg, ppgSource,
      adp:             resolvedAdp,
      adpSource:       adp !== null ? "fantasycalc_rank" : fallbackAdp !== null ? "estimated" : null,
      positionalAdp, adpTrend, adpDelta,
      trend:           trendDir,
      injury,
      seasonAvg:       parseFloat(seasonAvg.toFixed(2)),
      last4Avg:        parseFloat(last4Avg.toFixed(2)),
      last8Avg:        parseFloat(last8Avg.toFixed(2)),
      trendPct:        parseFloat(trendPct.toFixed(1)),
      opportunityScore:  50,
      consistencyScore,
      boomPct, bustPct, sosScore, playoffSosScore: (defRanksByPos["K"] ? Math.round(((32 - (defRanksByPos["K"][sp.team] || 16)) / 31) * 94 + 3) : sosScore), bye: byeWeekMap[sp.team] || sp.bye_week || null,
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
      news:            this._buildNews(sp, injStatus, fetchedAt.players),
      _live: {
        injuryAgeMinutes:     kInjuryAgeMin,
        projectionAgeMinutes: kProjAgeMin,
        newsAgeMinutes:       kInjuryAgeMin,
        opponentAgeMinutes:   kInjuryAgeMin,
        lastRefresh: fetchedAt.players ? new Date(fetchedAt.players).toISOString() : null,
        staleFlags: kStaleFlags,
      },
      aiRecommendation: aiRec,
    };
  },

  _positionalAdpFallback(pos, positionalRank) {
    if (!positionalRank || positionalRank < 1) return null;
    // Linearly interpolate within each tier so every rank gets a unique ADP value.
    // { min, max, adpMin, adpMax } — rank range maps to ADP range.
    const tiers = {
      QB: [
        { min:1,  max:1,  adpMin:22,  adpMax:22  },
        { min:2,  max:5,  adpMin:45,  adpMax:75  },
        { min:6,  max:12, adpMin:80,  adpMax:130 },
        { min:13, max:24, adpMin:135, adpMax:200 },
        { min:25, max:99, adpMin:205, adpMax:350 },
      ],
      RB: [
        { min:1,  max:3,  adpMin:3,   adpMax:9   },
        { min:4,  max:10, adpMin:14,  adpMax:38  },
        { min:11, max:24, adpMin:42,  adpMax:90  },
        { min:25, max:40, adpMin:92,  adpMax:140 },
        { min:41, max:60, adpMin:142, adpMax:180 },
        { min:61, max:99, adpMin:185, adpMax:280 },
      ],
      WR: [
        { min:1,  max:3,  adpMin:6,   adpMax:14  },
        { min:4,  max:10, adpMin:18,  adpMax:44  },
        { min:11, max:24, adpMin:48,  adpMax:92  },
        { min:25, max:40, adpMin:94,  adpMax:142 },
        { min:41, max:60, adpMin:144, adpMax:178 },
        { min:61, max:99, adpMin:182, adpMax:280 },
      ],
      TE: [
        { min:1,  max:1,  adpMin:12,  adpMax:12  },
        { min:2,  max:5,  adpMin:50,  adpMax:75  },
        { min:6,  max:12, adpMin:80,  adpMax:125 },
        { min:13, max:24, adpMin:130, adpMax:185 },
        { min:25, max:99, adpMin:188, adpMax:320 },
      ],
      K: [
        { min:1,  max:12, adpMin:152, adpMax:175 },
        { min:13, max:32, adpMin:177, adpMax:210 },
        { min:33, max:99, adpMin:212, adpMax:280 },
      ],
      DST: [
        { min:1,  max:5,  adpMin:55,  adpMax:90  },
        { min:6,  max:12, adpMin:95,  adpMax:130 },
        { min:13, max:20, adpMin:135, adpMax:165 },
        { min:21, max:32, adpMin:168, adpMax:200 },
        { min:33, max:99, adpMin:202, adpMax:270 },
      ],
    };
    const posTable = tiers[pos];
    if (!posTable) return null;
    for (const tier of posTable) {
      if (positionalRank >= tier.min && positionalRank <= tier.max) {
        if (tier.min === tier.max) return tier.adpMin;
        const t = (positionalRank - tier.min) / (tier.max - tier.min);
        return parseFloat((tier.adpMin + t * (tier.adpMax - tier.adpMin)).toFixed(1));
      }
    }
    return null;
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

  /**
   * Build a normalized news array for a player.
   *
   * Normalized shape:
   *   { headline, timestamp, source, severity, waiver, urgency }
   *
   * severity levels:
   *   CRITICAL — Out / IR (confirmed absence)
   *   ALERT    — Doubtful (~50% play rate)
   *   WATCH    — Questionable (non-offseason, ~78% play rate)
   *   INFO     — REC (offseason recovery) or healthy
   *
   * The legacy `urgency` field is kept alongside `severity` so that
   * existing consumers (Ticker, NewsItem) continue to work without
   * a breaking change.
   */
  _buildNews(sp, injStatus, fetchedAtMs = null) {
    const timestamp = fetchedAtMs || Date.now();
    const name = sp.full_name || `${sp.first_name || ""} ${sp.last_name || ""}`.trim();
    if (injStatus) {
      const isRec = this._isOffseasonInjury(sp);
      const severity =
          (injStatus === "Out" || injStatus === "IR") ? "CRITICAL"
        : injStatus === "Doubtful"                    ? "ALERT"
        : (injStatus === "Questionable" && isRec)     ? "INFO"
        : injStatus === "Questionable"                ? "WATCH"
        : "INFO";
      const urgency =
          severity === "CRITICAL" ? "breaking"
        : severity === "ALERT"    ? "high"
        : severity === "WATCH"    ? "high"
        : "normal";
      return [{
        headline:  sp.injury_notes || `${name} listed as ${injStatus}. Monitor practice reports.`,
        timestamp,
        source:    "sleeper",
        severity,
        urgency,   // legacy compat
        waiver:    injStatus === "Out" || injStatus === "IR",
        // Keep text alias for legacy consumers that read n.text
        text:      sp.injury_notes || `${name} listed as ${injStatus}. Monitor practice reports.`,
      }];
    }
    return [{
      headline:  `${name} — no injury designation. Active and practicing.`,
      timestamp,
      source:    "sleeper",
      severity:  "INFO",
      urgency:   "normal",  // legacy compat
      waiver:    false,
      text:      `${name} — no injury designation. Active and practicing.`,
    }];
  },
};

/**
 * Rank each NFL defense by how many fantasy points it ALLOWS to each position.
 *
 * Correct model: every scorer's fantasy points for a week are attributed to the
 * team they FACED that week (their opponent's defense), bucketed by the scorer's
 * position. For DST scorers the same attribution means "points a given offense
 * gave up to opposing DSTs" — a lower-scoring/turnover-prone offense = easier
 * DST matchup — so the DST bucket works with the identical logic.
 *
 * Ranking is ASCENDING: rank 1 = allows the FEWEST points = toughest matchup.
 * This aligns with defRankToGrade (rank ≥25 → "A" = easy, rank ≤8 → "D" = tough).
 *
 * @param {Array<Object>} weeklyStatsArray  Sleeper weekly stat maps, oldest→newest
 * @param {Object} sleeperPlayers           pid → player (for team + position)
 * @param {Array<Record<string,string>>} weekOpponentMaps  per-week team→opponent,
 *        index-aligned with weeklyStatsArray (from ESPNService.getWeekOpponentMap)
 */
export function computeDefensiveRankings(weeklyStatsArray, sleeperPlayers, weekOpponentMaps = []) {
  const NFL_TEAMS = [
    "ARI","ATL","BAL","BUF","CAR","CHI","CIN","CLE","DAL","DEN",
    "DET","GB","HOU","IND","JAX","KC","LAC","LAR","LV","MIA",
    "MIN","NE","NO","NYG","NYJ","PHI","PIT","SEA","SF","TB","TEN","WAS",
  ];
  const POSITIONS = ["QB","RB","WR","TE","K","DST"];

  // allowed[team][pos] = fantasy points that team's opponents scored AT pos
  //                      against team (i.e. points team's defense allowed).
  const allowed = {};
  NFL_TEAMS.forEach(t => { allowed[t] = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 }; });

  weeklyStatsArray.forEach((weekStats, i) => {
    if (!weekStats) return;
    const oppMap = weekOpponentMaps[i] || {};
    Object.entries(weekStats).forEach(([pid, stats]) => {
      const sp  = sleeperPlayers[pid];
      const pos = sp?.position === "DEF" ? "DST" : sp?.position;
      const scorerTeam = sp?.team;
      if (!scorerTeam || !POSITIONS.includes(pos)) return;

      const defense = oppMap[scorerTeam];      // team the scorer faced this week
      if (!defense || !allowed[defense]) return; // bye week / schedule not available

      // Sleeper pre-computes fantasy points; use PPR as the ranking standard.
      const fp = typeof stats.pts_ppr === "number" ? stats.pts_ppr
               : typeof stats.pts_std === "number" ? stats.pts_std : 0;
      allowed[defense][pos] += fp;
    });
  });

  // Rank ascending: rank 1 = allows fewest = toughest defense at that position.
  const ranks = {};
  POSITIONS.forEach(pos => {
    const sorted = [...NFL_TEAMS].sort((a, b) => (allowed[a][pos] ?? 0) - (allowed[b][pos] ?? 0));
    ranks[pos] = {};
    sorted.forEach((team, idx) => { ranks[pos][team] = idx + 1; });
  });

  return ranks;
}
