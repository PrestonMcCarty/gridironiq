/**
 * Sleeper Platform Adapter
 * ========================
 * Converts Sleeper API responses into the GridironIQ normalized league model.
 * Only this file should know about Sleeper-specific field names.
 */

import { fetchJSON } from "@/lib/cache";
import { CURRENT_SEASON, CURRENT_WEEK } from "@/lib/constants";
import { PLATFORMS, LEAGUE_TYPES, SCORING_TYPES, makeLeagueId, EMPTY_LEAGUE_DATA } from "@/lib/league/LeagueModel";

// ── Helpers ────────────────────────────────────────────────────────────────
function sleeperType(settings) {
  const t = settings?.type;
  return t === 2 ? LEAGUE_TYPES.DYNASTY : t === 1 ? LEAGUE_TYPES.KEEPER : LEAGUE_TYPES.REDRAFT;
}

function sleeperScoring(settings) {
  const rec = settings?.rec ?? settings?.rec_per_rec ?? 1;
  return rec >= 1 ? SCORING_TYPES.PPR : rec >= 0.5 ? SCORING_TYPES.HALF_PPR : SCORING_TYPES.STANDARD;
}

function sleeperSlots(rosterPositions = []) {
  const slots = { QB: 0, RB: 0, WR: 0, TE: 0, FLEX: 0, SUPER_FLEX: 0, K: 0, DST: 0, BN: 0 };
  rosterPositions.forEach(pos => {
    if (pos === "BN")         slots.BN++;
    else if (pos === "FLEX")  slots.FLEX++;
    else if (pos === "SUPER_FLEX") slots.SUPER_FLEX++;
    else if (slots[pos] !== undefined) slots[pos]++;
  });
  return slots;
}

// ── Normalizers ────────────────────────────────────────────────────────────

function normalizeRoster(roster, userMap, rank) {
  const user = userMap[roster.owner_id] || {};
  return {
    teamId:       String(roster.roster_id),
    ownerId:      String(roster.owner_id || ""),
    ownerName:    user.display_name || user.metadata?.team_name || `Team ${roster.roster_id}`,
    teamName:     user.metadata?.team_name || user.display_name || `Team ${roster.roster_id}`,
    avatarUrl:    user.avatar ? `https://sleepercdn.com/avatars/thumbs/${user.avatar}` : null,
    playerIds:    (roster.players || []).map(String),
    record: {
      wins:   roster.settings?.wins   || 0,
      losses: roster.settings?.losses || 0,
      ties:   roster.settings?.ties   || 0,
      pf:     parseFloat((roster.settings?.fpts        || 0).toFixed(2)),
      pa:     parseFloat((roster.settings?.fpts_against|| 0).toFixed(2)),
    },
    rank:        rank,
    playoffSeed: null,
  };
}

function normalizeTransaction(txn) {
  return {
    id:        txn.transaction_id || txn.leg || String(Date.now()),
    type:      txn.type === "trade" ? "trade" : txn.type === "waiver" ? "waiver" : "free_agent",
    week:      txn.leg || 0,
    timestamp: txn.status_updated || txn.created || 0,
    rosterIds: (txn.roster_ids || []).map(String),
    adds:      Object.fromEntries(
      Object.entries(txn.adds || {}).map(([pid, rid]) => [String(pid), String(rid)])
    ),
    drops:     Object.fromEntries(
      Object.entries(txn.drops || {}).map(([pid, rid]) => [String(pid), String(rid)])
    ),
  };
}

function normalizeMatchupWeek(matchups, week) {
  const byTeam = {};
  matchups.forEach(m => {
    byTeam[String(m.roster_id)] = {
      week,
      teamId:         String(m.roster_id),
      opponentId:     null, // resolved in a second pass
      matchupId:      m.matchup_id,
      points:         parseFloat((m.points || 0).toFixed(2)),
      opponentPoints: 0,
      win:            null,
      starters:       (m.starters || []).map(String),
      bench:          (m.players || []).filter(p => !(m.starters || []).includes(p)).map(String),
    };
  });
  // Second pass: link opponents
  const byMatchupId = {};
  Object.values(byTeam).forEach(t => {
    if (!byMatchupId[t.matchupId]) byMatchupId[t.matchupId] = [];
    byMatchupId[t.matchupId].push(t);
  });
  Object.values(byMatchupId).forEach(pair => {
    if (pair.length === 2) {
      pair[0].opponentId     = pair[1].teamId;
      pair[1].opponentId     = pair[0].teamId;
      pair[0].opponentPoints = pair[1].points;
      pair[1].opponentPoints = pair[0].points;
      pair[0].win = pair[0].points > pair[1].points ? true : pair[0].points < pair[1].points ? false : null;
      pair[1].win = pair[1].points > pair[0].points ? true : pair[1].points < pair[0].points ? false : null;
    }
  });
  return Object.values(byTeam);
}

// ── Public adapter API ─────────────────────────────────────────────────────
export const SleeperAdapter = {
  platform: PLATFORMS.SLEEPER,

  /**
   * Look up a user by username and return all their leagues for the season.
   * Returns: Array<{ platformLeagueId, name, type, totalTeams, season, userId }>
   */
  /**
   * Look up a Sleeper user by username. Returns the raw user object with user_id.
   */
  async getUserByUsername(username) {
    return fetchJSON(
      `https://api.sleeper.app/v1/user/${username}`,
      3_600_000, `sleeper:user:${username}`
    );
  },

  async getLeaguesForUser(credentials) {
    const { username } = credentials;
    if (!username) throw new Error("Sleeper username required");

    const user = await fetchJSON(
      `https://api.sleeper.app/v1/user/${username}`,
      3_600_000, `sleeper:user:${username}`
    );
    if (!user?.user_id) throw new Error("Sleeper user not found");

    const season = CURRENT_SEASON;
    const leagues = await fetchJSON(
      `https://api.sleeper.app/v1/user/${user.user_id}/leagues/nfl/${season}`,
      1_800_000, `sleeper:leagues:${user.user_id}:${season}`
    ) || [];

    return leagues.map(l => ({
      platformLeagueId: l.league_id,
      name:             l.name,
      type:             sleeperType(l.settings),
      scoring:          sleeperScoring(l.scoring_settings),
      totalTeams:       l.total_rosters,
      season:           String(l.season),
      userId:           user.user_id,
      avatarUrl:        l.avatar ? `https://sleepercdn.com/avatars/thumbs/${l.avatar}` : null,
      slots:            sleeperSlots(l.roster_positions),
      _raw:             l,
    }));
  },

  /**
   * Fetch a single league by ID (no user auth needed for public leagues).
   */
  async getLeagueInfo(platformLeagueId) {
    const info = await fetchJSON(
      `https://api.sleeper.app/v1/league/${platformLeagueId}`,
      3_600_000, `sleeper:league:${platformLeagueId}`
    );
    if (!info) throw new Error(`League ${platformLeagueId} not found`);
    return {
      platformLeagueId,
      name:        info.name,
      type:        sleeperType(info.settings),
      scoring:     sleeperScoring(info.scoring_settings),
      totalTeams:  info.total_rosters,
      season:      String(info.season),
      avatarUrl:   info.avatar ? `https://sleepercdn.com/avatars/thumbs/${info.avatar}` : null,
      slots:       sleeperSlots(info.roster_positions),
      _raw:        info,
    };
  },

  /**
   * Fetch all live league data and normalize it.
   * Returns NormalizedLeagueData.
   */
  async getLeagueData(platformLeagueId, userId) {
    const [rawRosters, rawUsers] = await Promise.all([
      fetchJSON(`https://api.sleeper.app/v1/league/${platformLeagueId}/rosters`,
        900_000, `sleeper:rosters:${platformLeagueId}`) || [],
      fetchJSON(`https://api.sleeper.app/v1/league/${platformLeagueId}/users`,
        3_600_000, `sleeper:users:${platformLeagueId}`) || [],
    ]);

    const userMap = {};
    (rawUsers || []).forEach(u => { userMap[u.user_id] = u; });

    // Sort by wins descending to assign rank
    const sorted = [...(rawRosters || [])].sort(
      (a, b) => (b.settings?.wins || 0) - (a.settings?.wins || 0)
    );
    const rosters = sorted.map((r, i) => normalizeRoster(r, userMap, i + 1));

    // Resolve myTeamId
    let myTeamId = null;
    if (userId) {
      const mine = rosters.find(r => String(r.ownerId) === String(userId));
      if (mine) myTeamId = mine.teamId;
    }
    // No fallback to rosters[0] — if ownership cannot be determined, return null.
    // useLeagueStore will surface a clear error rather than silently showing the wrong team.

    // Transactions in background
    let transactions = [];
    try {
      const weeks = Array.from({ length: CURRENT_WEEK }, (_, i) => i + 1);
      const chunks = [];
      for (let i = 0; i < weeks.length; i += 4) chunks.push(weeks.slice(i, i + 4));
      const all = [];
      for (const chunk of chunks) {
        const results = await Promise.all(chunk.map(w =>
          fetchJSON(
            `https://api.sleeper.app/v1/league/${platformLeagueId}/transactions/${w}`,
            1_800_000, `sleeper:txn:${platformLeagueId}:${w}`
          ).then(d => d || [])
        ));
        results.forEach(r => all.push(...r));
      }
      transactions = all.map(normalizeTransaction);
    } catch (e) {
      console.warn("[SleeperAdapter] Transactions failed:", e.message);
    }

    // Matchups for current week
    const matchups = {};
    try {
      const raw = await fetchJSON(
        `https://api.sleeper.app/v1/league/${platformLeagueId}/matchups/${CURRENT_WEEK}`,
        900_000, `sleeper:matchups:${platformLeagueId}:${CURRENT_WEEK}`
      ) || [];
      matchups[CURRENT_WEEK] = normalizeMatchupWeek(raw, CURRENT_WEEK);
    } catch {}

    return { rosters, matchups, transactions, draftPicks: [], schedule: {}, myTeamId };
  },

  /** Map a userId to their team's playerIds — returns [] if userId not found (no silent fallback) */
  getMyRosterIds(data, userId) {
    if (!data?.rosters?.length || !userId) return [];
    const mine = data.rosters.find(r => String(r.ownerId) === String(userId));
    if (!mine) {
      console.warn(`[SleeperAdapter] getMyRosterIds: userId ${userId} not found in ${data.rosters.length} rosters`);
      return [];
    }
    return mine.playerIds || [];
  },

  getMyTeamId(data, userId) {
    if (!data?.rosters?.length || !userId) return null;
    const mine = data.rosters.find(r => String(r.ownerId) === String(userId));
    if (!mine) {
      console.warn(`[SleeperAdapter] getMyTeamId: userId ${userId} not found in rosters`);
      return null;
    }
    return mine.teamId || null;
  },
};
