import { normalizeTeam } from "@/lib/identity/nameNormalizer";

/**
 * OddsService
 * ===========
 * Client wrapper for the /api/odds route, which returns each team's implied
 * team total (Vegas scoring-environment signal). Keyed by Sleeper team abbr,
 * so joining to a player is a direct team lookup.
 *
 * Returns { configured, teams: { TEAM: { impliedTotal, total, spread, opponent, homeAway } } }.
 */
export const OddsService = {
  async getVegas() {
    const r = await fetch("/api/odds");
    if (!r.ok) return { configured: true, teams: {} };
    return (await r.json()) || { configured: false, teams: {} };
  },

  /** Look up a Sleeper player's team environment. */
  lookup(sp, teamsMap) {
    if (!sp || !teamsMap) return null;
    return teamsMap[normalizeTeam(sp.team)] || null;
  },
};
