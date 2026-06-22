/**
 * GridironIQ Player Identity — Name Normalization
 * =================================================
 * Shared normalization used by every tier of the crosswalk matcher.
 * Handles the full range of NFL player name inconsistencies across sources.
 *
 * No external dependencies — pure string transformation.
 */

import { POS_EQUIV, CANONICAL_POSITIONS } from "./crosswalkSchema.js";

// ── Core normalizer ────────────────────────────────────────────────────────

/** Strip everything except lowercase ASCII letters. Primary match key. */
export const normLetters = s =>
  (s || "").toLowerCase().replace(/[^a-z]/g, "");

/** Lowercase + collapse whitespace, keep spaces between words. */
const normWords = s =>
  (s || "").toLowerCase().replace(/[^a-z\s]/g, "").replace(/\s+/g, " ").trim();

// ── Suffix / prefix tables ─────────────────────────────────────────────────
const SUFFIXES    = /\s+(jr\.?|sr\.?|ii|iii|iv|v|esq\.?)$/i;
const INITIALS    = /\b([A-Z])\.([A-Z])\.?\b/g;          // D.J. → DJ
const APOSTROPHE  = /'/g;                                  // De'Von → Devon
const HYPHEN_WORD = /\b(\w+)-(\w+)\b/g;                  // Amon-Ra → AmonRa

/**
 * Build a Set of normalised key variants for one player name string.
 * The matcher tries every key in the set against the opponent pool.
 *
 * Handles:
 *   Suffixes:     Josh Allen Jr. → Josh Allen
 *   Initials:     D.J. Moore → DJ Moore
 *   Apostrophes:  De'Von Achane → Devon Achane
 *   Hyphens:      Amon-Ra St. Brown → AmonRa St Brown
 *   Middle names: Patrick Lavon Mahomes → Patrick Mahomes
 *   Nicknames:    Mitch Trubisky / Mitchell Trubisky (handled by fuzzy tier)
 */
export function buildNameKeys(rawName) {
  if (!rawName) return new Set();
  const keys = new Set();

  const variants = new Set([rawName]);

  // Remove suffix
  const noSuffix = rawName.replace(SUFFIXES, "").trim();
  if (noSuffix !== rawName) variants.add(noSuffix);

  // Expand initials: D.J. → DJ
  variants.add(rawName.replace(INITIALS, "$1$2"));

  for (const v of variants) {
    const base = v
      .replace(APOSTROPHE, "")          // apostrophes out
      .replace(HYPHEN_WORD, "$1$2");    // hyphen → join

    // Key 1: strip all non-letters (primary)
    keys.add(normLetters(base));

    // Key 2: first + last only (handles middle names)
    const words = normWords(base).split(" ").filter(Boolean);
    if (words.length >= 2) {
      keys.add(words[0] + words[words.length - 1]);
    }

    // Key 3: full lowercased+collapsed
    keys.add(normWords(base).replace(/\s/g, ""));
  }

  return keys;
}

/**
 * Normalise a position string to a canonical position or null.
 * Returns null for IDP / non-fantasy positions.
 */
export function normalizePosition(rawPos) {
  if (!rawPos) return null;
  const upper = rawPos.toUpperCase().trim();
  const mapped = POS_EQUIV[upper];
  return mapped !== undefined ? mapped : null; // undefined → unknown; null → explicitly excluded
}

/**
 * Normalise a team abbreviation.
 * Handles common variants (e.g. JAC → JAX, ARZ → ARI, OAK → LV).
 */
export function normalizeTeam(rawTeam) {
  if (!rawTeam) return null;
  const up = rawTeam.toUpperCase().trim();
  const TEAM_ALIASES = {
    JAC: "JAX", ARZ: "ARI", CLV: "CLE", HST: "HOU",
    OAK: "LV",  SL:  "LAR", SD:  "LAC", // legacy abbreviations
    WSH: "WAS", WFT: "WAS", GBP: "GB",  KCC: "KC",
    SFO: "SF",  TBB: "TB",  NOS: "NO",  NEP: "NE",
    SLC: "LAR", LAR: "LAR", LAC: "LAC",
  };
  return TEAM_ALIASES[up] || up;
}

/**
 * Compute a simple edit-distance-based similarity score between two strings.
 * Returns 0.0–1.0. Used only by Tier 3 (fuzzy) matching.
 *
 * Uses the Jaro-Winkler-approximation for short strings.
 * Intentionally simple — we don't need perfect fuzzy matching,
 * just enough to catch "Mitch"/"Mitchell" and "D.J."/"DJ" variants
 * that buildNameKeys doesn't already handle.
 */
export function nameSimilarity(a, b) {
  const s1 = normLetters(a);
  const s2 = normLetters(b);
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1.0;

  const longer  = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;

  if (longer.length === 0) return 1.0;
  if (shorter.length === 0) return 0.0;

  // Simple overlap score: count common characters in order
  let i = 0, j = 0, matches = 0;
  while (i < longer.length && j < shorter.length) {
    if (longer[i] === shorter[j]) { matches++; j++; }
    i++;
  }

  const overlap = matches / longer.length;

  // Prefix bonus (shared first 3 chars → more weight)
  let prefix = 0;
  for (let k = 0; k < Math.min(3, shorter.length); k++) {
    if (s1[k] === s2[k]) prefix++;
    else break;
  }

  return Math.min(1.0, overlap + prefix * 0.05);
}

/**
 * Compute a team-match penalty.
 * Same team = 0 penalty. Different team = -0.15. Missing team = -0.05.
 */
export function teamPenalty(teamA, teamB) {
  const a = normalizeTeam(teamA);
  const b = normalizeTeam(teamB);
  if (!a || !b) return -0.05;
  return a === b ? 0 : -0.15;
}
