// ─── CONSTANTS ───────────────────────────────────────────────────────────────
// CURRENT_SEASON and CURRENT_WEEK are resolved at runtime from Sleeper's
// /nfl_state/nfl endpoint so the app never needs to be manually updated.
// These module-level variables are populated by initNflState() which is called
// once from usePlayers before any data fetching begins.
export let CURRENT_SEASON = 2025;   // overwritten by initNflState()
export let CURRENT_WEEK   = 1;      // overwritten by initNflState()

/**
 * Fetches the live NFL state from Sleeper and updates the module-level
 * CURRENT_SEASON / CURRENT_WEEK exports.  Safe to call multiple times —
 * subsequent calls within the same browser session are de-duplicated by
 * the shared fetchJSON cache.
 *
 * Sleeper state object shape (relevant fields):
 *   { season: "2025", week: 4, season_type: "regular" | "post" | "pre" }
 *
 * During the off-season (season_type !== "regular") we keep week = 1 so
 * that stats requests don't 404 on week 0.
 */
let _stateInitialized = false;
export async function initNflState() {
  if (_stateInitialized) return;
  try {
    const res  = await fetch("https://api.sleeper.app/v1/state/nfl");
    const data = await res.json();
    if (data?.season) {
      CURRENT_SEASON = parseInt(data.season, 10);
    }
    if (data?.week && data.season_type === "regular") {
      // Use the completed week (display_week - 1) so stats actually exist.
      // Sleeper's `week` field is the *current* week that is in-progress or upcoming.
      // `display_week` is what they show in their UI.
      CURRENT_WEEK = Math.max(1, parseInt(data.week, 10) - 1);
    } else if (data?.week && data.season_type === "post") {
      CURRENT_WEEK = 18; // regular season is over; use final regular-season week
    } else {
      CURRENT_WEEK = 1; // pre-season / off-season — minimal fallback
    }
    _stateInitialized = true;
  } catch (e) {
    console.warn("[GridironIQ] Could not fetch NFL state, using defaults:", e.message);
    // Leave defaults (2025, week 1) in place
  }
}

export const NFL_TEAMS = [
  "ARI","ATL","BAL","BUF","CAR","CHI","CIN","CLE","DAL","DEN",
  "DET","GB","HOU","IND","JAX","KC","LAC","LAR","LV","MIA",
  "MIN","NE","NO","NYG","NYJ","PHI","PIT","SEA","SF","TB","TEN","WAS",
];

export const PLAYOFF_WEEKS = [15, 16, 17];

export const defRankToGrade = rank =>
  rank >= 25 ? "A" : rank >= 17 ? "B" : rank >= 9 ? "C" : "D";

export const defRankToLabel = rank =>
  rank >= 25 ? "Excellent" : rank >= 17 ? "Favorable" : rank >= 9 ? "Neutral" : "Tough";

export const DEFAULT_SETTINGS = {
  teams: 12,
  scoring: "PPR",
  superflex: false,
  slots: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DST: 1, BN: 6 },
};

// Default roster IDs — empty until user connects their Sleeper league.
// Previously this held hardcoded player IDs which became stale as players
// changed teams, retired, or were dropped.  The correct source is always
// the live Sleeper roster fetched via LeagueConnectPanel.
export const MY_ROSTER_SLEEPER_IDS_DEFAULT = [];

export const NAV_ITEMS = [
  { id: "draft",   label: "Draft"   },
  { id: "lineup",  label: "Lineup"  },
  { id: "trades",  label: "Trades"  },
  { id: "team",    label: "My Team" },
  { id: "players", label: "Players" },
];
