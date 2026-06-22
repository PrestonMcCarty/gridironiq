/**
 * ESPN Fantasy Platform Adapter
 * ==============================
 * ESPN Fantasy Sports uses a private REST API at lm-api-reads.fantasy.espn.com.
 * Public leagues need no auth.
 * Private leagues require espn_s2 + SWID cookie values from the user's browser.
 *
 * ESPN does NOT use OAuth — authentication is cookie-based.
 * The user copies their espn_s2 and SWID values from browser DevTools.
 *
 * Base URL: https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl
 * All requests include ?view= query params to select response projections.
 */

import { PLATFORMS, LEAGUE_TYPES, SCORING_TYPES, EMPTY_LEAGUE_DATA } from "@/lib/league/LeagueModel";
import { cache } from "@/lib/cache";

const ESPN_BASE = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl";

// ── Fetch helper with ESPN cookie auth ────────────────────────────────────
async function espnFetch(url, cookies = {}, ttlMs = 900_000, cacheKey = url) {
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const headers = { "Content-Type": "application/json" };
  const cookieParts = [];
  if (cookies.espn_s2) cookieParts.push(`espn_s2=${cookies.espn_s2}`);
  if (cookies.SWID)    cookieParts.push(`SWID=${cookies.SWID}`);
  if (cookieParts.length) headers["Cookie"] = cookieParts.join("; ");

  try {
    const r = await fetch(url, { headers });
    if (r.status === 401) throw new Error("ESPN auth failed — check espn_s2 and SWID values");
    if (r.status === 404) throw new Error("ESPN league not found — verify the league ID");
    if (!r.ok) throw new Error(`ESPN API error: HTTP ${r.status}`);
    const data = await r.json();
    cache.set(cacheKey, data, ttlMs);
    return data;
  } catch (e) {
    console.warn(`[ESPNAdapter] Fetch failed for ${cacheKey}:`, e.message);
    throw e;
  }
}

// ── Type mapping ───────────────────────────────────────────────────────────
function espnType(settings) {
  // ESPN uses keeper=true, isDynasty=true flags
  if (settings?.isDynasty) return LEAGUE_TYPES.DYNASTY;
  if (settings?.isKeeper || settings?.keeperCount > 0) return LEAGUE_TYPES.KEEPER;
  return LEAGUE_TYPES.REDRAFT;
}

function espnScoring(settings) {
  // ESPN scoring: receptionPoints field
  const recPts = settings?.receptionPoints ?? 1;
  if (recPts >= 1)   return SCORING_TYPES.PPR;
  if (recPts >= 0.5) return SCORING_TYPES.HALF_PPR;
  return SCORING_TYPES.STANDARD;
}

// ESPN lineup slot IDs → position names
const ESPN_SLOT_MAP = {
  0:  "QB",  2: "RB",  4: "WR",  6: "TE",
  16: "DST", 17: "K",  23: "FLEX", 24: "SUPER_FLEX",
  20: "BN",  21: "IR",
};

function espnSlots(lineupSlotCounts = {}) {
  const slots = { QB: 0, RB: 0, WR: 0, TE: 0, FLEX: 0, SUPER_FLEX: 0, K: 0, DST: 0, BN: 0, IR: 0 };
  Object.entries(lineupSlotCounts).forEach(([slotId, count]) => {
    const pos = ESPN_SLOT_MAP[parseInt(slotId)];
    if (pos && slots[pos] !== undefined) slots[pos] = count;
  });
  return slots;
}

// ESPN position IDs → Sleeper-compatible position strings
const ESPN_POS_MAP = {
  1: "QB", 2: "RB", 3: "WR", 4: "TE",
  5: "K",  16: "DST",
};

/** Map ESPN playerId → approximate Sleeper player ID by name lookup */
function resolvePlayerIds(espnRoster, playerMap) {
  return espnRoster
    .map(entry => {
      const pid = entry.playerId;
      // Try direct ESPN→Sleeper ID map first, then fall back to name match
      return playerMap[pid] || String(pid);
    })
    .filter(Boolean);
}

// ── Normalize roster ───────────────────────────────────────────────────────
function normalizeRoster(team, rank) {
  const roster = team.roster?.entries || [];
  // ESPN player IDs are numeric — we store them as strings but note they are
  // ESPN-native and need cross-referencing with the player pool by name.
  const playerIds = roster.map(e => String(e.playerId));
  return {
    teamId:       String(team.id),
    ownerId:      String(team.primaryOwner || ""),
    ownerName:    `${team.owners?.[0]?.firstName || ""} ${team.owners?.[0]?.lastName || ""}`.trim()
                  || `Team ${team.id}`,
    teamName:     team.name || `Team ${team.id}`,
    avatarUrl:    team.logo || null,
    playerIds,
    record: {
      wins:   team.record?.overall?.wins   || 0,
      losses: team.record?.overall?.losses || 0,
      ties:   team.record?.overall?.ties   || 0,
      pf:     parseFloat((team.record?.overall?.pointsFor   || 0).toFixed(2)),
      pa:     parseFloat((team.record?.overall?.pointsAgainst || 0).toFixed(2)),
    },
    rank,
    playoffSeed: team.playoffSeed || null,
  };
}

// ── Public adapter API ─────────────────────────────────────────────────────
export const ESPNAdapter = {
  platform: PLATFORMS.ESPN,

  /**
   * ESPN doesn't have a "list leagues for user" API without full OAuth.
   * Users must provide their league ID manually.
   * Returns a single-item array matching the same shape as Sleeper's list.
   */
  async getLeaguesForUser(credentials) {
    const { leagueId, season, espn_s2, SWID } = credentials;
    if (!leagueId) throw new Error("ESPN league ID required");
    const info = await this.getLeagueInfo(leagueId, { espn_s2, SWID, season });
    return [info];
  },

  async getLeagueInfo(platformLeagueId, credentials = {}) {
    const { espn_s2, SWID, season = new Date().getFullYear() } = credentials;
    const url = `${ESPN_BASE}/seasons/${season}/segments/0/leagues/${platformLeagueId}?view=mSettings&view=mTeam`;
    const data = await espnFetch(url, { espn_s2, SWID }, 3_600_000,
      `espn:league:${platformLeagueId}:${season}`);

    const settings = data.settings?.scheduleSettings;
    const scoring  = data.settings?.scoringSettings;

    return {
      platformLeagueId,
      name:       data.settings?.name || `ESPN League ${platformLeagueId}`,
      type:       espnType(data.settings),
      scoring:    espnScoring(scoring),
      totalTeams: data.settings?.size || data.teams?.length || 0,
      season:     String(season),
      avatarUrl:  null,
      slots:      espnSlots(data.settings?.rosterSettings?.lineupSlotCounts || {}),
      _auth:      { espn_s2, SWID },
      _raw:       data,
    };
  },

  async getLeagueData(platformLeagueId, userId, credentials = {}) {
    const { espn_s2, SWID } = credentials;
    const season = credentials.season || new Date().getFullYear();

    const url = `${ESPN_BASE}/seasons/${season}/segments/0/leagues/${platformLeagueId}`
      + `?view=mRoster&view=mTeam&view=mStandings&view=mMatchup&view=mTransactions2`;

    let data;
    try {
      data = await espnFetch(url, { espn_s2, SWID }, 900_000,
        `espn:data:${platformLeagueId}:${season}`);
    } catch (e) {
      console.error("[ESPNAdapter] Failed to fetch league data:", e.message);
      return { ...EMPTY_LEAGUE_DATA, error: e.message };
    }

    // Sort teams by wins for ranking
    const teams = [...(data.teams || [])].sort(
      (a, b) => (b.record?.overall?.wins || 0) - (a.record?.overall?.wins || 0)
    );
    const rosters = teams.map((t, i) => normalizeRoster(t, i + 1));

    // Resolve myTeamId by ESPN userId
    let myTeamId = null;
    if (userId) {
      const mine = data.teams?.find(t =>
        t.owners?.some(o => String(o.id) === String(userId) || String(t.primaryOwner) === String(userId))
      );
      if (mine) myTeamId = String(mine.id);
    }
    // No fallback to rosters[0] — return null if ownership cannot be determined.

    // Matchups
    const matchups = {};
    const currentWeek = data.status?.currentMatchupPeriod || 1;
    const scheduleItems = data.schedule || [];
    const weekItems = scheduleItems.filter(s => s.matchupPeriodId === currentWeek);
    matchups[currentWeek] = weekItems.map(m => ({
      week:           currentWeek,
      teamId:         String(m.home?.teamId ?? ""),
      opponentId:     String(m.away?.teamId ?? ""),
      points:         parseFloat((m.home?.totalPoints || 0).toFixed(2)),
      opponentPoints: parseFloat((m.away?.totalPoints || 0).toFixed(2)),
      win:            m.winner === "HOME" ? true : m.winner === "AWAY" ? false : null,
      starters:       (m.home?.rosterForCurrentScoringPeriod?.entries || [])
                        .filter(e => e.lineupSlotId !== 20) // exclude bench
                        .map(e => String(e.playerId)),
      bench:          (m.home?.rosterForCurrentScoringPeriod?.entries || [])
                        .filter(e => e.lineupSlotId === 20)
                        .map(e => String(e.playerId)),
    }));

    // Transactions
    const transactions = (data.transactions || []).map((txn, i) => ({
      id:        String(txn.id || i),
      type:      txn.type?.toLowerCase().includes("trade") ? "trade" : "waiver",
      week:      txn.scoringPeriodId || 0,
      timestamp: txn.processDate || 0,
      rosterIds: (txn.items || []).map(item => String(item.toTeamId || item.fromTeamId)).filter(Boolean),
      adds:      Object.fromEntries(
        (txn.items || []).filter(i => i.type === "ADD")
          .map(i => [String(i.playerId), String(i.toTeamId)])
      ),
      drops:     Object.fromEntries(
        (txn.items || []).filter(i => i.type === "DROP")
          .map(i => [String(i.playerId), String(i.fromTeamId)])
      ),
    }));

    return { rosters, matchups, transactions, draftPicks: [], schedule: {}, myTeamId };
  },

  getMyRosterIds(data, userId) {
    if (!data?.rosters?.length || !userId) return [];
    const mine = data.rosters.find(r => String(r.ownerId) === String(userId));
    if (!mine) {
      console.warn(`[ESPNAdapter] getMyRosterIds: userId ${userId} not found in ${data.rosters.length} rosters`);
      return [];
    }
    // ESPN player IDs are numeric strings — they won't directly match Sleeper IDs.
    // The UI layer must cross-reference by player name to resolve to Sleeper IDs.
    return mine.playerIds || [];
  },

  getMyTeamId(data, userId) {
    if (!data?.rosters?.length || !userId) return null;
    const mine = data.rosters.find(r => String(r.ownerId) === String(userId));
    if (!mine) {
      console.warn(`[ESPNAdapter] getMyTeamId: userId ${userId} not found in rosters`);
      return null;
    }
    return mine.teamId || null;
  },
};
