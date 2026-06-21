/**
 * Platform Registry
 * ==================
 * Single entry point for all platform operations.
 * Routes calls to the correct adapter based on the platform field.
 * New platforms are registered here — no changes needed elsewhere.
 */

import { PLATFORMS } from "@/lib/league/LeagueModel";
import { SleeperAdapter } from "@/lib/league/adapters/SleeperAdapter";
import { ESPNAdapter }    from "@/lib/league/adapters/ESPNAdapter";
import { YahooAdapter }   from "@/lib/league/adapters/YahooAdapter";

const REGISTRY = {
  [PLATFORMS.SLEEPER]: SleeperAdapter,
  [PLATFORMS.ESPN]:    ESPNAdapter,
  [PLATFORMS.YAHOO]:   YahooAdapter,
};

export function getAdapter(platform) {
  const adapter = REGISTRY[platform];
  if (!adapter) throw new Error(`Unknown platform: ${platform}`);
  return adapter;
}

export { PLATFORMS };

/**
 * Get leagues for a user on a given platform.
 * credentials shape varies by platform:
 *   Sleeper: { username }
 *   ESPN:    { leagueId, espn_s2?, SWID?, season? }
 *   Yahoo:   { accessToken }
 */
export async function getLeaguesForUser(platform, credentials) {
  return getAdapter(platform).getLeaguesForUser(credentials);
}

/**
 * Fetch and normalize all live league data for a stored league.
 * leagueEntry is the normalized stored league record (includes _auth if set).
 */
export async function getLeagueData(leagueEntry) {
  const adapter = getAdapter(leagueEntry.platform);
  return adapter.getLeagueData(
    leagueEntry.platformLeagueId,
    leagueEntry.userId,
    leagueEntry._auth || {},
  );
}

/**
 * Extract the user's roster player IDs from normalized league data.
 * Returns Sleeper-compatible string IDs.
 */
export function getMyRosterIds(platform, data, userId) {
  return getAdapter(platform).getMyRosterIds(data, userId);
}

export function getMyTeamId(platform, data, userId) {
  return getAdapter(platform).getMyTeamId(data, userId);
}
