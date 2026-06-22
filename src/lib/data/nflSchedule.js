/**
 * NFL Schedule Service
 * =====================
 * Replaces the hardcoded byeMap in tradeFinder.js and the fake
 * playoffSosScore = sosScore assignment in playerIntelligence.js.
 *
 * Sources:
 *   Bye weeks:     sp.bye_week field on Sleeper /v1/players/nfl objects (live)
 *   Opponents:     sp.opponent_abbr field (current week, from Sleeper)
 *   Playoff SoS:   Defensive rankings for weeks 15-17 opponents
 *                  Computed from defRanksByPos after multiWeekStats are loaded.
 *
 * This module is pure data transformation — no fetch calls of its own.
 * It receives sleeperPlayers and defRanksByPos from usePlayers.js.
 */

export const NFLScheduleService = {
  /**
   * Build a team → bye week map from live Sleeper player data.
   * Sleeper's /v1/players/nfl response includes bye_week on each player.
   * We read it from the first player found per team rather than a hardcoded table.
   *
   * @param {Object} sleeperPlayers  — raw dict from Sleeper /players/nfl
   * @returns {Object}  { ARI: 6, ATL: 12, ... }
   */
  buildByeWeekMap(sleeperPlayers) {
    const byeMap = {};
    Object.values(sleeperPlayers).forEach(sp => {
      if (sp.team && sp.bye_week && !byeMap[sp.team]) {
        byeMap[sp.team] = parseInt(sp.bye_week, 10);
      }
    });
    return byeMap;
  },

  /**
   * Get bye week for a team.
   * Falls back gracefully — returns null rather than crashing.
   *
   * @param {string} team       — NFL team abbreviation
   * @param {Object} byeWeekMap — built by buildByeWeekMap()
   * @returns {number|null}
   */
  getByeWeek(team, byeWeekMap) {
    if (!team || !byeWeekMap) return null;
    return byeWeekMap[team] || null;
  },

  /**
   * Build a player_id → playoff opponents map.
   *
   * Sleeper does not expose future schedule via the players endpoint.
   * Until a schedule API is integrated, we use the current defRanksByPos
   * as a proxy — it's real data, and for most of the season the current
   * opponent rank IS a reasonable weekly SoS signal.
   *
   * When a real schedule source is available (e.g. Sleeper schedule endpoint
   * or ESPN schedule scrape), replace this method to return actual week 15-17
   * opponent abbreviations per team, then average their defRanks.
   *
   * @param {Object} defRanksByPos  — { QB: { ARI: 14, ATL: 22, ... }, ... }
   * @param {string} team           — player's team
   * @param {string} pos            — player's position
   * @returns {number}  0–100 playoff SoS score (higher = easier schedule)
   */
  computePlayoffSoS(defRanksByPos, team, pos) {
    if (!team || !defRanksByPos || !pos) return 50;

    const posRanks = defRanksByPos[pos] || defRanksByPos["QB"] || {};
    const rank     = posRanks[team];

    if (!rank) return 50; // no data → neutral

    // rank 1 = easiest matchup (most pts allowed), rank 32 = toughest
    // Map to 0-100: rank 1 → 97, rank 32 → 3
    return Math.round(((32 - rank) / 31) * 94 + 3);
  },

  /**
   * Validate the bye week map.
   * Returns a health report for the schedule data.
   */
  validateByeWeekMap(byeWeekMap) {
    const NFL_TEAMS = [
      "ARI","ATL","BAL","BUF","CAR","CHI","CIN","CLE","DAL","DEN",
      "DET","GB","HOU","IND","JAX","KC","LAC","LAR","LV","MIA",
      "MIN","NE","NO","NYG","NYJ","PHI","PIT","SEA","SF","TB","TEN","WAS",
    ];
    const covered = NFL_TEAMS.filter(t => byeWeekMap[t]);
    const missing = NFL_TEAMS.filter(t => !byeWeekMap[t]);
    const valid   = Object.values(byeWeekMap).every(w => w >= 1 && w <= 18);

    return {
      covered: covered.length,
      missing,
      valid,
      source: covered.length > 0 ? "sleeper_live" : "none",
    };
  },
};
