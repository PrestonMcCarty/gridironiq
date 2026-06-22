/**
 * GridironIQ Player Identity — Crosswalk Schema
 * ===============================================
 * Defines the canonical player ID model and crosswalk entry shape.
 * This file has no external dependencies — safe to import anywhere.
 *
 * Canonical ID convention:
 *   giq:{sleeper_id}          e.g.  "giq:4046"       (skill players)
 *   giq:dst:{TEAM}            e.g.  "giq:dst:KC"      (defenses)
 *   giq:syn:{hash}            e.g.  "giq:syn:a3f9"    (synthetic — rare)
 */

// ── Match method constants ─────────────────────────────────────────────────
export const MATCH_METHOD = {
  EXACT_ID:       "exact_id",        // Tier 0 — direct source ID bridge
  NAME_TEAM_POS:  "name_team_pos",   // Tier 1 — normalized name + team + position
  NAME_POS:       "name_pos",        // Tier 2 — name + position (team mismatch ok)
  FUZZY:          "fuzzy",           // Tier 3 — fuzzy name + position
  DST_ABBR:       "dst_abbr",        // DST — team abbreviation (always 1.0)
  MANUAL:         "manual",          // Human-confirmed override
};

// ── Confidence thresholds ──────────────────────────────────────────────────
export const CONFIDENCE = {
  AUTO_ACCEPT:    0.90,   // ≥ 0.90 → write to crosswalk, no review needed
  LOW_FLAG:       0.60,   // 0.60–0.89 → write with LOW_CONFIDENCE flag
  QUARANTINE:     0.00,   // < 0.60 → quarantine, never auto-write
};

// ── Match method → base confidence ────────────────────────────────────────
export const METHOD_CONFIDENCE = {
  [MATCH_METHOD.EXACT_ID]:      1.00,
  [MATCH_METHOD.DST_ABBR]:      1.00,
  [MATCH_METHOD.MANUAL]:        1.00,
  [MATCH_METHOD.NAME_TEAM_POS]: 0.95,
  [MATCH_METHOD.NAME_POS]:      0.80,
  [MATCH_METHOD.FUZZY]:         0.65,
};

// ── Entry flags ────────────────────────────────────────────────────────────
export const FLAGS = {
  LOW_CONFIDENCE:    "LOW_CONFIDENCE",     // confidence 0.60–0.89
  AMBIGUOUS:         "AMBIGUOUS",          // 2+ candidates at same tier
  ROOKIE:            "ROOKIE",             // not in NFLverse yet
  HISTORY_ONLY:      "HISTORY_ONLY",       // retired — in actuals, not live
  STALE:             "STALE",              // not re-resolved this season
  POSITION_CONFLICT: "POSITION_CONFLICT",  // sources disagree on position
  EXPECTED_SPARSE:   "EXPECTED_SPARSE",    // K/DST — missing source links expected
  SYNTHETIC_ID:      "SYNTHETIC_ID",       // giq:syn: — no Sleeper anchor
};

// ── Position equivalence map ───────────────────────────────────────────────
// Normalizes source-specific position strings to canonical POSITIONS
export const POS_EQUIV = {
  // Skill
  QB: "QB", RB: "RB", WR: "WR", TE: "TE",
  // Kicker variants
  K: "K", PK: "K", KR: "K",
  // DST variants
  DST: "DST", DEF: "DST", D: "DST", ST: "DST",
  // Fullback → RB
  FB: "RB",
  // IDP positions — not fantasy-relevant, excluded
  DE: null, DT: null, LB: null, CB: null, S: null, OL: null, OT: null,
  OG: null, C: null, P: null, LS: null, DB: null, DL: null, EDGE: null,
};

export const CANONICAL_POSITIONS = ["QB", "RB", "WR", "TE", "DST", "K"];

// ── NFL team abbreviation master list ─────────────────────────────────────
export const NFL_TEAMS = [
  "ARI","ATL","BAL","BUF","CAR","CHI","CIN","CLE","DAL","DEN",
  "DET","GB","HOU","IND","JAX","KC","LAC","LAR","LV","MIA",
  "MIN","NE","NO","NYG","NYJ","PHI","PIT","SEA","SF","TB","TEN","WAS",
];

/**
 * Build the canonical ID for a player.
 * @param {"skill"|"dst"|"synthetic"} type
 * @param {string} key  — sleeper_id for skill, team abbr for DST, hash for synthetic
 */
export function buildCanonicalId(type, key) {
  if (type === "dst")       return `giq:dst:${key.toUpperCase()}`;
  if (type === "synthetic") return `giq:syn:${key}`;
  return `giq:${key}`;
}

/**
 * Validate a single CrosswalkEntry shape.
 * Returns { valid, issues[] }
 */
export function validateCrosswalkEntry(entry) {
  const issues = [];
  if (!entry.canonical_id?.startsWith("giq:")) issues.push("invalid_canonical_id");
  if (!entry.sleeper_id && !entry.canonical_id?.startsWith("giq:dst:") && !entry.canonical_id?.startsWith("giq:syn:"))
    issues.push("missing_sleeper_id");
  if (!CANONICAL_POSITIONS.includes(entry.position)) issues.push(`invalid_position:${entry.position}`);
  if (typeof entry.confidence !== "number" || entry.confidence < 0 || entry.confidence > 1)
    issues.push("invalid_confidence");
  if (!Object.values(MATCH_METHOD).includes(entry.match_method)) issues.push("invalid_match_method");
  return { valid: issues.length === 0, issues };
}
