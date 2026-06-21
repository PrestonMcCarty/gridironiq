/**
 * GridironIQ Normalized League Model
 * ====================================
 * All platform adapters (Sleeper, Yahoo, ESPN) must produce objects
 * conforming to these shapes.  No platform-specific data should ever
 * escape an adapter — the engines, hooks, and UI components only ever
 * see these normalized types.
 *
 * Designed so a future browser-extension draft room can import the same
 * model and feed it directly to the recommendation engine without any
 * platform-specific glue code.
 */

// ── Supported platforms ────────────────────────────────────────────────────
export const PLATFORMS = {
  SLEEPER: "sleeper",
  YAHOO:   "yahoo",
  ESPN:    "espn",
};

export const PLATFORM_LABELS = {
  sleeper: "Sleeper",
  yahoo:   "Yahoo Fantasy",
  espn:    "ESPN Fantasy",
};

// ── League types ───────────────────────────────────────────────────────────
export const LEAGUE_TYPES = {
  REDRAFT: "Redraft",
  KEEPER:  "Keeper",
  DYNASTY: "Dynasty",
};

// ── Scoring types ──────────────────────────────────────────────────────────
export const SCORING_TYPES = {
  PPR:      "PPR",
  HALF_PPR: "Half-PPR",
  STANDARD: "Standard",
};

/**
 * NormalizedLeague — the persisted league record.
 *
 * {
 *   // Identity
 *   id:            string          — internal composite key: `${platform}:${platformLeagueId}`
 *   platform:      "sleeper"|"yahoo"|"espn"
 *   platformLeagueId: string       — the ID as the platform knows it
 *   name:          string
 *   season:        string          — e.g. "2025"
 *   type:          "Redraft"|"Keeper"|"Dynasty"
 *   scoring:       "PPR"|"Half-PPR"|"Standard"
 *   totalTeams:    number
 *   avatarUrl:     string|null
 *
 *   // User's team within this league
 *   userId:        string|null     — platform-specific user ID
 *   myTeamId:      string|null     — platform-specific team/roster ID
 *   myRosterIds:   string[]        — Sleeper player IDs for matched players
 *
 *   // Roster slots (from league settings)
 *   slots: { QB, RB, WR, TE, FLEX, K, DST, BN, ... }
 *
 *   // Metadata
 *   addedAt:       number          — timestamp
 *   lastRefreshed: number|null     — timestamp
 *
 *   // Auth tokens (never logged, stored encrypted in memory only)
 *   _auth:         object|null     — platform-specific, never persisted to localStorage
 * }
 */
export function makeLeagueId(platform, platformLeagueId) {
  return `${platform}:${platformLeagueId}`;
}

export function parsLeagueId(id) {
  const [platform, ...rest] = (id || "").split(":");
  return { platform, platformLeagueId: rest.join(":") };
}

/**
 * NormalizedRoster — one team's roster within the league.
 *
 * {
 *   teamId:        string          — platform team/roster ID
 *   ownerId:       string|null     — platform user ID of the owner
 *   ownerName:     string          — display name
 *   teamName:      string
 *   avatarUrl:     string|null
 *   playerIds:     string[]        — Sleeper player IDs (normalized)
 *   record: {
 *     wins, losses, ties, pf, pa  — points for / against
 *   }
 *   rank:          number          — current standings rank (1-based)
 *   playoffSeed:   number|null
 * }
 */

/**
 * NormalizedMatchup — one week's matchup for a team.
 *
 * {
 *   week:          number
 *   teamId:        string
 *   opponentId:    string|null     — null for bye
 *   points:        number
 *   opponentPoints: number
 *   win:           boolean|null    — null if not played yet
 *   starters:      string[]        — player IDs in starting lineup
 *   bench:         string[]        — player IDs on bench
 * }
 */

/**
 * NormalizedTransaction — trade or waiver/FA move.
 *
 * {
 *   id:            string
 *   type:          "trade"|"waiver"|"free_agent"
 *   week:          number
 *   timestamp:     number
 *   rosterIds:     string[]        — teams involved
 *   adds:          { [playerId]: teamId }
 *   drops:         { [playerId]: teamId }
 * }
 */

/**
 * NormalizedDraftPick — one pick in a draft.
 *
 * {
 *   round:         number
 *   pick:          number          — pick within round
 *   overallPick:   number
 *   teamId:        string
 *   playerId:      string|null     — null if future pick traded away
 *   playerName:    string|null
 * }
 */

/**
 * Full normalized league data (runtime only, not persisted).
 *
 * {
 *   rosters:      NormalizedRoster[]
 *   matchups:     { [week]: NormalizedMatchup[] }
 *   transactions: NormalizedTransaction[]
 *   draftPicks:   NormalizedDraftPick[]
 *   schedule:     { [week]: { [teamId]: string } }  — teamId → opponentId
 * }
 */
export const EMPTY_LEAGUE_DATA = {
  rosters:      [],
  matchups:     {},
  transactions: [],
  draftPicks:   [],
  schedule:     {},
};
