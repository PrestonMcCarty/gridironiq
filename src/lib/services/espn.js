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
