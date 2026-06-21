/**
 * Yahoo Fantasy Platform Adapter
 * ================================
 * Yahoo Fantasy Sports uses OAuth 2.0 with the Yahoo Fantasy Sports API v2.
 *
 * AUTH FLOW (browser → Next.js API route → Yahoo):
 *   1. User clicks "Connect Yahoo" → app opens Yahoo OAuth consent screen
 *   2. Yahoo redirects to /api/yahoo/callback?code=...
 *   3. Next.js route exchanges code for access_token + refresh_token
 *   4. Tokens stored in memory (access_token) + localStorage (refresh_token only)
 *   5. This adapter calls Yahoo API via /api/yahoo/proxy to avoid CORS
 *
 * API base: https://fantasysports.yahooapis.com/fantasy/v2
 * Responses are XML or JSON (json=true query param or Accept: application/json)
 *
 * NOTE: Yahoo refresh tokens are valid for 60 days after last use.
 * The proxy route handles silent refresh automatically.
 */

import { PLATFORMS, LEAGUE_TYPES, SCORING_TYPES, EMPTY_LEAGUE_DATA } from "@/lib/league/LeagueModel";
import { cache } from "@/lib/cache";

const YAHOO_PROXY = "/api/yahoo/proxy";

// ── Proxy fetch ────────────────────────────────────────────────────────────
async function yahooFetch(path, accessToken, ttlMs = 900_000) {
  const cacheKey = `yahoo:${path}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const r = await fetch(YAHOO_PROXY, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, accessToken }),
  });

  if (r.status === 401) throw new Error("Yahoo auth expired — please reconnect");
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Yahoo API error: ${text.slice(0, 200)}`);
  }

  const data = await r.json();
  cache.set(cacheKey, data, ttlMs);
  return data;
}

// ── Type helpers ───────────────────────────────────────────────────────────
function yahooType(settings) {
  // isDynastyLeague, is_keeper_league flags
  if (settings?.is_dynasty_league === "1") return LEAGUE_TYPES.DYNASTY;
  if (settings?.is_keeper_league  === "1") return LEAGUE_TYPES.KEEPER;
  return LEAGUE_TYPES.REDRAFT;
}

function yahooScoring(settings) {
  // receptions_points field in scoring_stat_categories
  const recPts = parseFloat(settings?.rec_pts ?? "1");
  if (recPts >= 1)   return SCORING_TYPES.PPR;
  if (recPts >= 0.5) return SCORING_TYPES.HALF_PPR;
  return SCORING_TYPES.STANDARD;
}

// Yahoo position IDs → normalized positions
const YAHOO_POS_MAP = {
  QB: "QB", RB: "RB", WR: "WR", TE: "TE",
  K: "K", DEF: "DST", D: "DST",
  W: "FLEX", "W/R": "FLEX", "W/R/T": "FLEX",
  "Q/W/R/T": "SUPER_FLEX", BN: "BN", IR: "IR",
};

function yahooSlots(rosterPositions = []) {
  const slots = { QB: 0, RB: 0, WR: 0, TE: 0, FLEX: 0, SUPER_FLEX: 0, K: 0, DST: 0, BN: 0, IR: 0 };
  rosterPositions.forEach(pos => {
    const mapped = YAHOO_POS_MAP[pos.position] || pos.position;
    if (slots[mapped] !== undefined) slots[mapped] += parseInt(pos.count || "1");
  });
  return slots;
}

// ── Normalizers ────────────────────────────────────────────────────────────
function normalizeRoster(team, rank) {
  const players = team.roster?.players || [];
  // Yahoo player_id values — need cross-referencing by name to get Sleeper IDs
  const playerIds = players.map(p => String(p.player?.[0]?.[1]?.player_id || p.player_id || "")).filter(Boolean);

  const stands = team.team_standings || {};
  return {
    teamId:     String(team.team_key || team.team_id),
    ownerId:    String(team.managers?.[0]?.manager?.guid || ""),
    ownerName:  team.name || `Team ${rank}`,
    teamName:   team.name || `Team ${rank}`,
    avatarUrl:  team.team_logos?.[0]?.team_logo?.url || null,
    playerIds,
    record: {
      wins:   parseInt(stands.outcome_totals?.wins   || "0"),
      losses: parseInt(stands.outcome_totals?.losses || "0"),
      ties:   parseInt(stands.outcome_totals?.ties   || "0"),
      pf:     parseFloat(stands.points_for   || "0"),
      pa:     parseFloat(stands.points_against || "0"),
    },
    rank,
    playoffSeed: parseInt(stands.playoff_seed || "0") || null,
  };
}

// ── Public adapter API ─────────────────────────────────────────────────────
export const YahooAdapter = {
  platform: PLATFORMS.YAHOO,

  /**
   * List all fantasy football leagues for the authenticated user.
   * Requires a valid Yahoo access token.
   */
  async getLeaguesForUser(credentials) {
    const { accessToken } = credentials;
    if (!accessToken) throw new Error("Yahoo access token required — connect via OAuth first");

    // Yahoo users endpoint: /users;use_login=1/games;game_codes=nfl/leagues
    const data = await yahooFetch(
      "/users;use_login=1/games;game_codes=nfl/leagues",
      accessToken, 1_800_000
    );

    const leagues = data?.fantasy_content?.users?.[0]?.user?.[1]
      ?.games?.flatMap(g => g.game?.[1]?.leagues || []) || [];

    return leagues.map(l => {
      const league = l.league?.[0] || l;
      return {
        platformLeagueId: String(league.league_key || league.league_id),
        name:             league.name,
        type:             yahooType(league),
        scoring:          yahooScoring(league.settings),
        totalTeams:       parseInt(league.num_teams || "12"),
        season:           String(league.season),
        avatarUrl:        null,
        slots:            yahooSlots(league.settings?.roster_positions || []),
        _raw:             league,
      };
    });
  },

  async getLeagueInfo(platformLeagueId, credentials = {}) {
    const { accessToken } = credentials;
    const data = await yahooFetch(
      `/league/${platformLeagueId};out=settings,standings`,
      accessToken, 3_600_000
    );
    const league = data?.fantasy_content?.league?.[0] || {};
    return {
      platformLeagueId,
      name:       league.name || `Yahoo League ${platformLeagueId}`,
      type:       yahooType(league),
      scoring:    yahooScoring(league.settings),
      totalTeams: parseInt(league.num_teams || "12"),
      season:     String(league.season),
      avatarUrl:  null,
      slots:      yahooSlots(league.settings?.roster_positions || []),
      _raw:       league,
    };
  },

  async getLeagueData(platformLeagueId, userId, credentials = {}) {
    const { accessToken } = credentials;
    if (!accessToken) return { ...EMPTY_LEAGUE_DATA, error: "Yahoo not authenticated" };

    let data;
    try {
      data = await yahooFetch(
        `/league/${platformLeagueId}/teams;out=roster,standings,transactions`,
        accessToken, 900_000
      );
    } catch (e) {
      console.error("[YahooAdapter] Failed to fetch league data:", e.message);
      return { ...EMPTY_LEAGUE_DATA, error: e.message };
    }

    const teams = data?.fantasy_content?.league?.[1]?.teams || {};
    const teamList = Object.values(teams).filter(t => t.team);

    // Sort by wins for ranking
    const sorted = [...teamList].sort((a, b) => {
      const aw = parseInt(a.team?.[0]?.[0]?.team_standings?.outcome_totals?.wins || "0");
      const bw = parseInt(b.team?.[0]?.[0]?.team_standings?.outcome_totals?.wins || "0");
      return bw - aw;
    });

    const rosters = sorted.map((t, i) => normalizeRoster(t.team[0][0], i + 1));

    // Resolve myTeamId
    let myTeamId = null;
    if (userId) {
      const mine = rosters.find(r => String(r.ownerId) === String(userId));
      if (mine) myTeamId = mine.teamId;
    }
    if (!myTeamId && rosters.length) myTeamId = rosters[0].teamId;

    // Transactions
    let transactions = [];
    try {
      const txnData = await yahooFetch(
        `/league/${platformLeagueId}/transactions;types=trade,add,drop`,
        accessToken, 1_800_000
      );
      const txnList = txnData?.fantasy_content?.league?.[1]?.transactions || {};
      transactions = Object.values(txnList)
        .filter(t => t.transaction)
        .map((t, i) => {
          const info = t.transaction?.[0] || {};
          const players = t.transaction?.[1]?.players || {};
          const adds = {}, drops = {};
          Object.values(players).filter(p => p.player).forEach(p => {
            const pid   = String(p.player[0][1].player_id);
            const action = p.transaction_data?.[0]?.type;
            const dest  = String(p.transaction_data?.[0]?.destination_team_key || "");
            const src   = String(p.transaction_data?.[0]?.source_team_key || "");
            if (action === "add")  adds[pid]  = dest;
            if (action === "drop") drops[pid] = src;
          });
          return {
            id:        String(info.transaction_key || i),
            type:      info.type === "trade" ? "trade" : info.type?.startsWith("add") ? "waiver" : "free_agent",
            week:      parseInt(info.timestamp || "0"),
            timestamp: parseInt(info.timestamp || "0") * 1000,
            rosterIds: [...new Set([...Object.values(adds), ...Object.values(drops)])],
            adds, drops,
          };
        });
    } catch (e) {
      console.warn("[YahooAdapter] Transactions failed:", e.message);
    }

    return { rosters, matchups: {}, transactions, draftPicks: [], schedule: {}, myTeamId };
  },

  getMyRosterIds(data, userId) {
    if (!data?.rosters?.length) return [];
    const mine = data.rosters.find(r => String(r.ownerId) === String(userId))
      || data.rosters[0];
    return mine?.playerIds || [];
  },

  getMyTeamId(data, userId) {
    if (!data?.rosters?.length) return null;
    const mine = data.rosters.find(r => String(r.ownerId) === String(userId));
    return mine?.teamId || data.rosters[0]?.teamId || null;
  },
};
