import { fetchJSON } from "@/lib/cache";
import { CURRENT_SEASON, CURRENT_WEEK } from "@/lib/constants";

export const SleeperService = {
  async getPlayers() {
    const data = await fetchJSON(
      "https://api.sleeper.app/v1/players/nfl",
      3_600_000,
      "sleeper:players"
    );
    return data || {};
  },

  async getStats(season, week) {
    const url = `https://api.sleeper.app/v1/stats/nfl/regular/${season}/${week}?season_type=regular`;
    return await fetchJSON(url, 3_600_000, `sleeper:stats:${season}:${week}`) || {};
  },

  async getProjections(season, week) {
    const url = `https://api.sleeper.app/v1/projections/nfl/regular/${season}/${week}?season_type=regular`;
    return await fetchJSON(url, 1_800_000, `sleeper:proj:${season}:${week}`) || {};
  },

  async getTrending(type = "add") {
    const url = `https://api.sleeper.app/v1/players/nfl/trending/${type}?lookback_hours=48&limit=25`;
    return await fetchJSON(url, 900_000, `sleeper:trending:${type}`) || [];
  },

  calcPPG(stats = {}, scoring = "PPR") {
    if (!stats) return 0;
    const s = stats;

    // ── Skill position scoring ───────────────────────────────────────────
    const recPts =
      scoring === "PPR"      ? (s.rec || 0) * 1
      : scoring === "Half-PPR" ? (s.rec || 0) * 0.5
      : 0;

    const skillPts =
      (s.pass_yd  || 0) * 0.04 +
      (s.pass_td  || 0) * 4    +
      (s.pass_int || 0) * -2   +
      (s.rush_yd  || 0) * 0.1  +
      (s.rush_td  || 0) * 6    +
      (s.rec_yd   || 0) * 0.1  +
      (s.rec_td   || 0) * 6    +
      recPts                    +
      (s.fum_lost || 0) * -2;

    // ── Kicker scoring ───────────────────────────────────────────────────
    // Standard kicker scoring: XP = 1pt, FG by distance
    const kickerPts =
      (s.xpm        || 0) * 1   +  // extra points made
      (s.fgm_0_19   || 0) * 3   +  // FGs 0-19 yards
      (s.fgm_20_29  || 0) * 3   +  // FGs 20-29 yards
      (s.fgm_30_39  || 0) * 3   +  // FGs 30-39 yards
      (s.fgm_40_49  || 0) * 4   +  // FGs 40-49 yards
      (s.fgm_50p    || 0) * 5   +  // FGs 50+ yards
      // Fallback: if distance buckets missing, use total fgm * 3
      ((!s.fgm_0_19 && !s.fgm_20_29 && !s.fgm_30_39 && !s.fgm_40_49 && !s.fgm_50p)
        ? (s.fgm || 0) * 3
        : 0);

    // ── D/ST scoring ─────────────────────────────────────────────────────
    // Standard D/ST scoring (most common league format)
    const ptsAllowed = s.pts_allow ?? s.pts_allowed ?? null;
    const dstPtsAllowedPts =
      ptsAllowed === null ? 0
      : ptsAllowed === 0   ? 10
      : ptsAllowed <= 6    ? 7
      : ptsAllowed <= 13   ? 4
      : ptsAllowed <= 20   ? 1
      : ptsAllowed <= 27   ? 0
      : ptsAllowed <= 34   ? -1
      : -4;

    const dstPts =
      dstPtsAllowedPts                +
      (s.sack        || 0) * 1        +  // sacks
      (s.int         || 0) * 2        +  // interceptions
      (s.fum_rec     || 0) * 2        +  // fumble recoveries
      (s.safe        || 0) * 2        +  // safeties
      (s.blk_kick    || 0) * 2        +  // blocked kicks
      (s.def_td      || 0) * 6        +  // defensive TDs
      (s.def_st_td   || 0) * 6        +  // special teams TDs
      (s.def_ret_td  || 0) * 6        +  // return TDs
      (s.tkl_loss    || 0) * 0        +  // tackles for loss (usually unscored)
      (s.def_pr_td   || 0) * 6;         // punt return TDs

    // Return whichever scoring group has non-zero value
    if (dstPts !== 0 || ptsAllowed !== null) return parseFloat(dstPts.toFixed(2));
    if (kickerPts > 0) return parseFloat(kickerPts.toFixed(2));
    return parseFloat(skillPts.toFixed(2));
  },
};
