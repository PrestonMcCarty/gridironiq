import { buildNameKeys, normalizeTeam, normLetters } from "@/lib/identity/nameNormalizer";

/**
 * NFLverseAdvancedService
 * =======================
 * Client wrapper for the /api/nflverse route, which returns per-player advanced
 * usage metrics (wopr, target share, air-yards share, snap %) aggregated from
 * NFLverse — the "real opportunity" data. The heavy CSV work happens server-side;
 * the client just fetches a few KB of JSON and joins it to Sleeper players by
 * name+team (Sleeper's cross-source IDs are too sparse to join on).
 *
 * The API map is keyed `${normLetters(name)}|${normTeam(team)}`; we build the
 * same key from a Sleeper player, trying each name variant for a robust match.
 */
export const NFLverseAdvancedService = {
  async getAdvanced(season) {
    const qs = season ? `?season=${season}` : "";
    const r = await fetch(`/api/nflverse${qs}`);
    if (!r.ok) throw new Error(`nflverse route HTTP ${r.status}`);
    const data = await r.json();
    return data || { season: null, players: {} };
  },

  /**
   * Look up a Sleeper player's advanced metrics in the API map.
   * @param {Object} sp        Sleeper player (needs full_name + team/position)
   * @param {Object} playersMap  data.players from getAdvanced()
   * @returns {Object|null}
   */
  lookup(sp, playersMap) {
    if (!sp || !playersMap) return null;
    const name = sp.full_name || `${sp.first_name || ""} ${sp.last_name || ""}`.trim();
    const team = normalizeTeam(sp.team);
    for (const nameKey of buildNameKeys(name)) {
      const hit = playersMap[`${nameKey}|${team}`];
      if (hit) return hit;
    }
    // Team-agnostic fallback (player changed teams since the stats season).
    const primary = normLetters(name);
    for (const key in playersMap) {
      if (key.startsWith(`${primary}|`)) return playersMap[key];
    }
    return null;
  },
};
