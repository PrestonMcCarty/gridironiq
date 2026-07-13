import { fetchJSON } from "@/lib/cache";

/**
 * ESPNService
 * ═══════════
 * Wraps ESPN's public (unofficial) site API to fill the one gap Sleeper leaves
 * open: the weekly schedule / per-team opponent. Sleeper's `opponent_abbr` is
 * null outside the active season, which starves the matchup engine and forces
 * every player into the "No opponent data" branch.
 *
 * The scoreboard endpoint is CORS-enabled and requires no API key. It returns
 * ESPN's current week — the upcoming or in-progress games — which is exactly
 * the slate a start/sit decision cares about.
 *
 * Endpoint:
 *   https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard
 */

// ESPN → Sleeper team-abbreviation normalization. Only Washington differs
// (ESPN "WSH" vs Sleeper "WAS"); every other abbreviation matches 1:1.
const ESPN_TO_SLEEPER = { WSH: "WAS" };
const normTeam = ab => (ab ? (ESPN_TO_SLEEPER[ab] || ab) : ab);

export const ESPNService = {
  /**
   * Fetches ESPN's current-week scoreboard and returns a per-team opponent map
   * plus schedule metadata. Team keys are normalized to Sleeper abbreviations
   * so consumers can index directly by a Sleeper player's `team`.
   *
   * @returns {{
   *   opponents: Record<string, { opp: string, homeAway: "home"|"away", kickoff: string|null }>,
   *   season: number|null, week: number|null, seasonType: number|null
   * }}
   */
  async getScheduleMap() {
    const url = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";
    const data = await fetchJSON(url, 900_000, "espn:scoreboard");
    return ESPNService._parse(data);
  },

  /**
   * Fetches the schedule for a specific season/week and returns a flat
   * team → opponent map (Sleeper abbreviations). Used to attribute each
   * player's weekly performance to the defense (or, for DST, the offense)
   * they actually faced, so defensive-vulnerability rankings are correct.
   *
   * Historical weeks are static, so they're cached aggressively (6 h).
   *
   * @param {number} season
   * @param {number} week
   * @param {number} seasonType 1=pre, 2=regular (default), 3=post
   * @returns {Promise<Record<string,string>>} { TEAM: OPP_TEAM }
   */
  async getWeekOpponentMap(season, week, seasonType = 2) {
    const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard`
      + `?dates=${season}&seasontype=${seasonType}&week=${week}`;
    const data = await fetchJSON(url, 6 * 60 * 60_000, `espn:sched:${season}:${seasonType}:${week}`);
    const { opponents } = ESPNService._parse(data);
    const map = {};
    for (const [team, info] of Object.entries(opponents)) map[team] = info.opp;
    return map;
  },

  _parse(data) {
    const opponents = {};
    const events = Array.isArray(data?.events) ? data.events : [];

    for (const ev of events) {
      const comp        = ev?.competitions?.[0];
      const competitors = comp?.competitors || [];
      const home = competitors.find(c => c.homeAway === "home");
      const away = competitors.find(c => c.homeAway === "away");
      const homeAb = normTeam(home?.team?.abbreviation);
      const awayAb = normTeam(away?.team?.abbreviation);
      if (!homeAb || !awayAb) continue;

      const kickoff = comp?.date || ev?.date || null;
      opponents[homeAb] = { opp: awayAb, homeAway: "home", kickoff };
      opponents[awayAb] = { opp: homeAb, homeAway: "away", kickoff };
    }

    return {
      opponents,
      season:     data?.season?.year ?? null,
      week:       data?.week?.number ?? null,
      seasonType: data?.season?.type ?? null,
    };
  },
};
