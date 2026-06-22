/**
 * GridironIQ Historical Scorer
 * ==============================
 * Recomputes fantasy points from raw component stats for three scoring formats.
 * Uses the same logic as SleeperService.calcPPG so historical and live
 * projections are always on the same scale.
 *
 * Versioned as "calcPPG_v1" — if scoring logic ever changes, bump the version
 * so artifacts can be regenerated identically.
 *
 * Supports: QB, RB, WR, TE, DST, K
 */

export const SCORING_ENGINE_VERSION = "calcPPG_v1";

// ── Per-scoring fantasy point computation ─────────────────────────────────

/**
 * Compute fantasy points from a stat_totals object.
 * Mirrors SleeperService.calcPPG exactly so historical == live projection.
 *
 * @param {Object} stats   — component stats (season totals or weekly)
 * @param {string} scoring — "PPR" | "Half-PPR" | "Standard"
 * @param {string} pos     — "QB"|"RB"|"WR"|"TE"|"DST"|"K"
 * @returns {number}  fantasy points (2 decimal places)
 */
export function computeFantasyPoints(stats, scoring, pos) {
  if (!stats) return 0;
  const s = stats;

  // ── DST ─────────────────────────────────────────────────────────────────
  if (pos === "DST") {
    const ptsAllowed = s.pts_allow ?? s.pts_allowed ?? null;
    const ptsAllowedScore =
      ptsAllowed === null  ? 0
      : ptsAllowed === 0   ? 10
      : ptsAllowed <= 6    ? 7
      : ptsAllowed <= 13   ? 4
      : ptsAllowed <= 20   ? 1
      : ptsAllowed <= 27   ? 0
      : ptsAllowed <= 34   ? -1
      : -4;

    return parseFloat((
      ptsAllowedScore                +
      (s.sack       || 0) * 1       +
      (s.int        || 0) * 2       +
      (s.fum_rec    || 0) * 2       +
      (s.safe       || 0) * 2       +
      (s.blk_kick   || 0) * 2       +
      (s.def_td     || 0) * 6       +
      (s.def_st_td  || 0) * 6       +
      (s.def_ret_td || 0) * 6       +
      (s.def_pr_td  || 0) * 6
    ).toFixed(2));
  }

  // ── Kicker ────────────────────────────────────────────────────────────
  if (pos === "K") {
    const hasBuckets = s.fgm_0_19 || s.fgm_20_29 || s.fgm_30_39 || s.fgm_40_49 || s.fgm_50p;
    return parseFloat((
      (s.xpm       || 0) * 1   +
      (s.fgm_0_19  || 0) * 3   +
      (s.fgm_20_29 || 0) * 3   +
      (s.fgm_30_39 || 0) * 3   +
      (s.fgm_40_49 || 0) * 4   +
      (s.fgm_50p   || 0) * 5   +
      (!hasBuckets ? (s.fgm || 0) * 3 : 0)
    ).toFixed(2));
  }

  // ── Skill players (QB / RB / WR / TE) ─────────────────────────────────
  const recPts =
    scoring === "PPR"      ? (s.rec || 0) * 1
    : scoring === "Half-PPR" ? (s.rec || 0) * 0.5
    : 0;

  return parseFloat((
    (s.pass_yd   || 0) * 0.04   +
    (s.pass_td   || 0) * 4      +
    (s.pass_int  || 0) * -2     +
    (s.rush_yd   || 0) * 0.1    +
    (s.rush_td   || 0) * 6      +
    (s.rec_yd    || 0) * 0.1    +
    (s.rec_td    || 0) * 6      +
    recPts                       +
    (s.fum_lost  || 0) * -2     +
    (s.pass_2pt  || 0) * 2      +
    (s.rush_2pt  || 0) * 2      +
    (s.rec_2pt   || 0) * 2
  ).toFixed(2));
}

// ── Season aggregation ─────────────────────────────────────────────────────

/**
 * Aggregate per-week stat rows into season totals.
 * Counts games played as distinct weeks with usable stats.
 *
 * @param {Object[]} weeklyRows  — normalized NFLverse rows for one player
 * @param {string}   pos
 * @returns {{ stat_totals, games_played, games_active }}
 */
export function aggregateSeasonStats(weeklyRows, pos) {
  const totals      = {};
  let games_played  = 0;
  let games_active  = 0;
  const seenWeeks   = new Set();

  // Stat columns to sum
  const SUMMABLE = [
    // Skill
    "pass_yd","pass_td","pass_int","completions","attempts",
    "rush_yd","rush_td","carries","fum_lost",
    "rec","rec_yd","rec_td","targets",
    "pass_2pt","rush_2pt","rec_2pt",
    // Kicker
    "fgm","fga","fgm_0_19","fgm_20_29","fgm_30_39","fgm_40_49","fgm_50p","xpm","xpa",
    // DST (summed for int, sack, etc. but pts_allow needs game-by-game scoring)
    "sack","int","fum_rec","safe","blk_kick","def_td","def_st_td","def_ret_td","def_pr_td",
    "tkl_loss",
  ];

  // DST pts_allow: must compute game-by-game fantasy pts, then sum
  let dstPtsFromAllowed = 0;

  weeklyRows.forEach(row => {
    const week = row.week;
    if (!seenWeeks.has(week)) {
      seenWeeks.add(week);
      games_played++;
      // "active" = had any fantasy-relevant stats (not just listed on roster)
      if (hasActivity(row, pos)) games_active++;
    }

    SUMMABLE.forEach(col => {
      if (row[col] !== undefined) {
        totals[col] = (totals[col] || 0) + (row[col] || 0);
      }
    });

    // DST: accumulate pts_allowed fantasy points game by game
    if (pos === "DST" && row.pts_allow !== undefined) {
      const pa = row.pts_allow;
      dstPtsFromAllowed +=
        pa === 0   ? 10
        : pa <= 6  ? 7
        : pa <= 13 ? 4
        : pa <= 20 ? 1
        : pa <= 27 ? 0
        : pa <= 34 ? -1
        : -4;
    }
  });

  // Store precomputed DST pts_allowed contribution so scorer can use it
  if (pos === "DST") {
    totals._dst_pts_allowed_total = dstPtsFromAllowed;
  }

  return { stat_totals: totals, games_played, games_active };
}

/**
 * Compute all three scoring formats from season totals.
 *
 * @param {Object} stat_totals
 * @param {number} games_played
 * @param {string} pos
 * @returns {{ fantasy_points_ppr, fantasy_points_half, fantasy_points_std,
 *             ppg_ppr, ppg_half, ppg_std }}
 */
export function computeSeasonScores(stat_totals, games_played, pos) {
  // For DST, use the precomputed pts_allowed total directly
  const statsForScoring = pos === "DST"
    ? { ...stat_totals, pts_allow: null } // pts_allow handled via _dst_pts_allowed_total
    : stat_totals;

  // PPR, Half-PPR, and Standard differ only for skill players (rec multiplier)
  const ppr  = pos === "DST"
    ? (computeFantasyPoints({ ...stat_totals, pts_allow: null }, "PPR", "DST")
       + (stat_totals._dst_pts_allowed_total || 0))
    : computeFantasyPoints(statsForScoring, "PPR", pos);

  const half = pos === "DST" ? ppr  // DST scoring is format-agnostic
    : computeFantasyPoints(statsForScoring, "Half-PPR", pos);

  const std  = pos === "DST" ? ppr
    : computeFantasyPoints(statsForScoring, "Standard", pos);

  const gp   = Math.max(1, games_played); // guard against div by zero

  return {
    fantasy_points_ppr:  parseFloat(ppr.toFixed(2)),
    fantasy_points_half: parseFloat(half.toFixed(2)),
    fantasy_points_std:  parseFloat(std.toFixed(2)),
    ppg_ppr:             parseFloat((ppr  / gp).toFixed(2)),
    ppg_half:            parseFloat((half / gp).toFixed(2)),
    ppg_std:             parseFloat((std  / gp).toFixed(2)),
  };
}

// ── Finish computation ─────────────────────────────────────────────────────

/**
 * Compute overall_finish and position_finish for every player in the pool.
 * Modifies records in-place, adding the finish fields.
 *
 * @param {Object[]} records  — HistoricalSeasonRecord[]
 * @param {string}   scoring  — which points column to rank by ("PPR")
 */
export function computeFinishes(records, scoring = "PPR") {
  const ptsFld = `fantasy_points_${scoring.toLowerCase().replace("-","").replace("ppr","ppr")}`;

  // Overall rank across ALL positions
  const sorted = [...records].sort((a, b) => (b[ptsFld] || 0) - (a[ptsFld] || 0));
  sorted.forEach((r, i) => { r.overall_finish = i + 1; });

  // Positional rank within each position
  const POSITIONS = ["QB","RB","WR","TE","DST","K"];
  POSITIONS.forEach(pos => {
    const posGroup = records
      .filter(r => r.position === pos)
      .sort((a, b) => (b[ptsFld] || 0) - (a[ptsFld] || 0));
    posGroup.forEach((r, i) => { r.position_finish = i + 1; });
  });
}

// ── Helper ─────────────────────────────────────────────────────────────────

function hasActivity(row, pos) {
  if (pos === "DST") return true;
  if (pos === "K")   return (row.fgm || 0) + (row.xpm || 0) > 0;
  return (row.pass_yd || 0) + (row.rush_yd || 0) + (row.rec_yd || 0) > 0;
}
