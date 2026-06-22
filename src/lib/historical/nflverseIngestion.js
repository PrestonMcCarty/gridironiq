/**
 * NFLverse Ingestion — 2024 Player Stats
 * ========================================
 * Fetches the NFLverse player_stats_{season}.csv from the public GitHub
 * release and normalizes column names to GridironIQ internal stat fields.
 *
 * NFLverse data: https://github.com/nflverse/nflverse-data
 * License: MIT (open data, free to use)
 *
 * This module runs as a BUILD STEP only — never in the user's data path.
 * It produces the raw per-player-per-week stat rows that artifactBuilder
 * aggregates into season totals.
 *
 * NFLverse CSV column → internal field mapping documented inline.
 */

import { parseCSV } from "@/lib/cache";
import { normalizePosition, normalizeTeam } from "@/lib/identity/nameNormalizer";

// ── NFLverse release URLs ─────────────────────────────────────────────────
const NFLVERSE_BASE = "https://github.com/nflverse/nflverse-data/releases/download/player_stats";

export const NFLVERSE_URLS = {
  2024: `${NFLVERSE_BASE}/player_stats_2024.csv`,
  2025: `${NFLVERSE_BASE}/player_stats_2025.csv`,
};

// ── Column mapping: NFLverse → internal ─────────────────────────────────
// NFLverse uses snake_case stat names that map cleanly to calcPPG inputs.
// Some columns have multiple aliases across NFLverse versions — handled below.
const COL_MAP = {
  // Identity
  player_id:          "gsis_id",          // NFLverse GSIS ID
  player_display_name:"display_name",
  player_name:        "player_name",       // fallback name
  recent_team:        "team",
  position:           "position",
  season:             "season",
  week:               "week",
  season_type:        "season_type",       // REG | POST | PRE

  // Passing
  completions:        "completions",
  attempts:           "attempts",
  passing_yards:      "pass_yd",
  passing_tds:        "pass_td",
  interceptions:      "pass_int",
  sacks:              "sack_taken",        // sacks taken by QB (not DST sacks)
  passing_2pt_conversions: "pass_2pt",

  // Rushing
  carries:            "carries",
  rushing_yards:      "rush_yd",
  rushing_tds:        "rush_td",
  rushing_fumbles_lost: "fum_lost",
  rushing_2pt_conversions: "rush_2pt",

  // Receiving
  receptions:         "rec",
  targets:            "targets",
  receiving_yards:    "rec_yd",
  receiving_tds:      "rec_td",
  receiving_fumbles_lost: "rec_fum_lost",  // separate from rushing fumbles
  receiving_2pt_conversions: "rec_2pt",

  // Kicker (sourced separately — see DST/K note below)
  // NFLverse player_stats includes kicker scoring in separate columns
  // for the "kicking" game type rows
  fg_made:            "fgm",
  fg_made_0_19:       "fgm_0_19",
  fg_made_20_29:      "fgm_20_29",
  fg_made_30_39:      "fgm_30_39",
  fg_made_40_49:      "fgm_40_49",
  fg_made_50_:        "fgm_50p",
  fg_att:             "fga",
  pat_made:           "xpm",
  pat_att:            "xpa",

  // Special teams / DST
  def_tackles_for_loss: "tkl_loss",
  def_sacks:          "sack",             // DST sacks (different from QB sacks taken)
  def_interceptions:  "int",
  def_fumble_recovery_own: "fum_rec_own",
  def_fumble_recovery_opp: "fum_rec",
  def_safety:         "safe",
  def_tds:            "def_td",
  special_teams_tds:  "def_st_td",
};

// ── Season-type filter ─────────────────────────────────────────────────────
// Only REG (regular season) weeks count toward fantasy season totals.
const REGULAR_SEASON = "REG";

// ── Ingestion ──────────────────────────────────────────────────────────────

/**
 * Fetch and parse the NFLverse player_stats CSV for a given season.
 *
 * @param {number} season   — e.g. 2024
 * @param {Object} [opts]
 * @param {string} [opts.overrideUrl]  — use a local URL for testing
 * @returns {Promise<Array<InternalStatRow>>}
 */
export async function fetchNFLverseStats(season, opts = {}) {
  const url = opts.overrideUrl || NFLVERSE_URLS[season];
  if (!url) throw new Error(`No NFLverse URL configured for season ${season}`);

  console.info(`[NFLverseIngestion] Fetching ${season} stats from NFLverse...`);
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`NFLverse fetch failed: HTTP ${resp.status} for ${url}`);

  const text = await resp.text();
  console.info(`[NFLverseIngestion] Downloaded ${(text.length / 1024).toFixed(0)}KB`);

  const rows = parseCSV(text);
  console.info(`[NFLverseIngestion] Parsed ${rows.length} raw rows`);

  return normalizeNFLverseRows(rows, season);
}

/**
 * Normalize raw NFLverse CSV rows to internal stat field names.
 * Filters to regular season only. Strips rows with no usable stats.
 *
 * @param {Object[]} rawRows
 * @param {number}   season
 * @returns {InternalStatRow[]}
 */
export function normalizeNFLverseRows(rawRows, season) {
  const normalized = [];
  let skippedSeason = 0, skippedPos = 0, skippedEmpty = 0;

  rawRows.forEach(raw => {
    // Regular season only
    const seasonType = raw.season_type || raw.game_type || REGULAR_SEASON;
    if (seasonType !== REGULAR_SEASON) { skippedSeason++; return; }

    // Position filter
    const rawPos = raw.position || raw.pos || "";
    const pos    = normalizePosition(rawPos);
    if (!pos) { skippedPos++; return; }

    // Build internal row
    const row = {
      gsis_id:      raw.player_id || raw.gsis_id || null,
      display_name: raw.player_display_name || raw.player_name || raw.name || "",
      position:     rawPos,
      pos,
      team:         normalizeTeam(raw.recent_team || raw.team || ""),
      season:       parseInt(raw.season || season, 10),
      week:         parseInt(raw.week || 0, 10),
    };

    // Map stat columns
    Object.entries(COL_MAP).forEach(([nflCol, intCol]) => {
      if (raw[nflCol] !== undefined && raw[nflCol] !== "") {
        const val = parseFloat(raw[nflCol]);
        if (!isNaN(val)) row[intCol] = val;
      }
    });

    // Merge fum_lost: rushing + receiving fumbles
    row.fum_lost = (row.fum_lost || 0) + (row.rec_fum_lost || 0);
    delete row.rec_fum_lost;

    // Skip rows with no countable stats (bye weeks, DNPs stored as zeroes)
    const hasStats = hasUsableStats(row, pos);
    if (!hasStats) { skippedEmpty++; return; }

    if (!row.gsis_id) {
      console.warn(`[NFLverseIngestion] Row missing gsis_id: ${row.display_name} ${row.team} W${row.week}`);
    }

    normalized.push(row);
  });

  console.info(
    `[NFLverseIngestion] Normalized ${normalized.length} rows ` +
    `(skipped: ${skippedSeason} non-REG, ${skippedPos} non-fantasy pos, ${skippedEmpty} empty)`
  );

  return normalized;
}

/**
 * A row is "usable" if the player appeared in the game with real stats.
 * Filters out bye weeks and pure DNP entries stored as all-zeros.
 */
function hasUsableStats(row, pos) {
  if (pos === "DST") {
    return (row.sack || 0) + (row.int || 0) + (row.def_td || 0) +
           (row.fum_rec || 0) + (row.safe || 0) > 0 ||
           row.pts_allow !== undefined;
  }
  if (pos === "K") {
    return (row.fgm || 0) + (row.fgm_0_19 || 0) + (row.fgm_20_29 || 0) +
           (row.fgm_30_39 || 0) + (row.fgm_40_49 || 0) + (row.fgm_50p || 0) +
           (row.xpm || 0) > 0;
  }
  // Skill players: must have attempted something
  return (row.attempts || 0) + (row.carries || 0) + (row.targets || 0) +
         (row.rec || 0) + (row.pass_yd || 0) + (row.rush_yd || 0) + (row.rec_yd || 0) > 0;
}

/**
 * Group normalized rows by gsis_id for aggregation.
 * Returns { gsis_id → InternalStatRow[] }
 */
export function groupByPlayer(rows) {
  const groups = {};
  rows.forEach(row => {
    const id = row.gsis_id || `anon:${row.display_name}:${row.team}`;
    if (!groups[id]) groups[id] = [];
    groups[id].push(row);
  });
  return groups;
}
