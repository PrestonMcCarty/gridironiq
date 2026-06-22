import { fetchJSON } from "@/lib/cache";

// ── Name normalization helpers ────────────────────────────────────────────────
// We build multiple lookup keys per player to maximise match rate against
// Sleeper player names, which use different naming conventions.

/** Strip everything except lowercase letters — used as the primary key */
const normFull = s => (s || "").toLowerCase().replace(/[^a-z]/g, "");

/**
 * Build a Set of alternate name keys for a single player name string.
 * Handles: suffixes (Jr/Sr/II/III), initials (D.J.), apostrophes (De'Von),
 * hyphens (Amon-Ra), and spaces around punctuation.
 */
function buildNameKeys(rawName) {
  if (!rawName) return new Set();
  const keys = new Set();

  // 1. Primary key — strip all non-letters
  keys.add(normFull(rawName));

  // 2. Remove common name suffixes before normalizing
  const noSuffix = rawName
    .replace(/\s+(jr\.?|sr\.?|ii|iii|iv|v)$/i, "")
    .trim();
  keys.add(normFull(noSuffix));

  // 3. Lowercase with spaces kept, then collapse
  const withSpaces = rawName.toLowerCase().replace(/[^a-z\s]/g, "").replace(/\s+/g, " ").trim();
  keys.add(withSpaces.replace(/\s/g, ""));

  // 4. First + last only (handles middle names in one source)
  const parts = withSpaces.split(" ").filter(Boolean);
  if (parts.length >= 2) {
    keys.add(parts[0] + parts[parts.length - 1]);
  }

  return keys;
}

// ── DST abbreviation → FantasyCalc normalized name key ────────────────────
// FantasyCalc DST entries use city/team names like "Chiefs D/ST".
// normFull("Chiefs D/ST") → "chiefsddst" — we pre-compute these keys so
// the lookup() method can resolve DST ADP by team abbreviation.
const DST_ABBR_TO_FC_KEY = {
  ARI: "cardinalsdst",  ATL: "falconsdst",    BAL: "ravensdst",
  BUF: "billsdst",      CAR: "panthersdst",   CHI: "bearsdst",
  CIN: "bengalsdst",    CLE: "brownsdst",     DAL: "cowboysdst",
  DEN: "broncosdst",    DET: "lionsdst",      GB:  "packersdst",
  HOU: "texansdst",     IND: "coltsdst",      JAX: "jaguarsdst",
  KC:  "chiefsdst",     LAC: "chargersdst",   LAR: "ramsdst",
  LV:  "raidersdst",    MIA: "dolphinsdst",   MIN: "vikingsdst",
  NE:  "patriotsdst",   NO:  "saintsdst",     NYG: "giantsdst",
  NYJ: "jetsdst",       PHI: "eaglesdst",     PIT: "steelersdst",
  SEA: "seahawksdst",   SF:  "ersdst",        TB:  "buccaneersdst",
  TEN: "titansdst",     WAS: "commandersdst",
};

export const FantasyCalcService = {
  /**
   * Fetches current redraft player values and ADP from FantasyCalc.
   *
   * FantasyCalc API response — relevant fields per item:
   *   {
   *     player: { name, position, maybeTeam, id },
   *     value:          850,   // dynasty trade value (0-1000)
   *     redraftValue:   920,   // redraft trade value (0-1000)
   *     overallPick:    14.3,  // REAL overall ADP (mean pick# across recent drafts)
   *     positionalPick:  2.1,  // positional ADP (TE2 = 2.1)
   *     adpDelta:       -1.2,  // ADP movement (+rising / -falling in pick number)
   *   }
   *
   * Returns an array of enriched records plus two helper methods
   * (buildNameMap, lookup) for use in usePlayers.
   */
  async getValues(isSuperflex = false) {
    const numQbs = isSuperflex ? 2 : 1;
    const url = `https://api.fantasycalc.com/values/current?isDynasty=false&numQbs=${numQbs}&numTeams=12&ppr=1&includes=players`;
    const data = await fetchJSON(url, 3_600_000, `fantasycalc:values:${numQbs}qb`);
    if (!data || !Array.isArray(data)) return [];

    return data
      .filter(d => d.player?.name)
      .map((d, idx) => {
        const rawName  = d.player.name  || "";
        const position = d.player.position || "";

        // ── ADP from FantasyCalc's overallRank ────────────────────────
        // FC's overallPick / positionalPick fields no longer exist in the
        // free API response. overallRank (1-200) is the closest ordinal
        // proxy: multiply by 1.1 to produce a pick-number-scale value that
        // fits a standard 12-team 20-round draft (~240 picks total).
        // positionRank is the within-position rank (also non-null for all 200).
        const overallAdp    = typeof d.overallRank   === "number" ? parseFloat((d.overallRank   * 1.1).toFixed(1)) : null;
        const positionalAdp = typeof d.positionRank  === "number" ? d.positionRank  : null;

        // adpDelta / adpTrend: FC no longer publishes pick-delta, use value trend
        const adpDelta = null;
        const adpTrend = d.trend30Day > 50 ? "rising" : d.trend30Day < -50 ? "falling" : "stable";

        // Positional rank for the fallback ADP tier table (used by playerIntelligence)
        const positionalRank = typeof d.positionRank === "number" ? d.positionRank : null;

        return {
          name:           rawName,
          position,
          team:           d.player.maybeTeam || "",
          fantasyCalcId:  d.player.id        || null,
          value:          d.value            || 0,
          redraftValue:   d.redraftValue     || 0,
          adp:            overallAdp,          // real overall ADP pick number
          positionalAdp,                       // positional ADP (e.g. RB3 = 3.4)
          adpTrend,                            // "rising" | "falling" | "stable" | null
          adpDelta,                            // raw movement in pick numbers
          responseRank:   idx + 1,             // rank within FC response
          positionalRank,
          nameKeys:       buildNameKeys(rawName),
        };
      });
  },

  /**
   * Build a name-keyed lookup map from a getValues() result array.
   * On key collision (two players map to the same normalized name),
   * the player with the lower responseRank (higher FC value) wins.
   */
  buildNameMap(records) {
    const map = {};
    records.forEach(rec => {
      rec.nameKeys.forEach(key => {
        if (key && (!map[key] || rec.responseRank < map[key].responseRank)) {
          map[key] = rec;
        }
      });
    });
    return map;
  },

  /**
   * Look up a Sleeper player record in the FC name map.
   * Tries every name variant and applies a position sanity check.
   *
   * @param {Object} sp       — raw Sleeper player object
   * @param {Object} nameMap  — built by buildNameMap()
   * @returns {Object|null}   — FC record or null
   */
  lookup(sp, nameMap) {
    if (!sp || !nameMap) return null;

    // ── DST: match by team abbreviation → FC team name ─────────────────────
    // FantasyCalc DST entries use names like "Chiefs D/ST", "Eagles D/ST" etc.
    // Sleeper DST entries have sp.team = "KC", sp.position = "DST".
    // Normal buildNameKeys("Kansas City Chiefs") won't match "chiefsddst".
    if (sp.position === "DST" || sp.position === "DEF") {
      const abbr = sp.team;
      if (abbr && DST_ABBR_TO_FC_KEY[abbr]) {
        const hit = nameMap[DST_ABBR_TO_FC_KEY[abbr]];
        if (hit) return hit;
      }
      return null;
    }

    const name = sp.full_name || `${sp.first_name || ""} ${sp.last_name || ""}`.trim();
    const keys = buildNameKeys(name);
    for (const key of keys) {
      const hit = nameMap[key];
      if (!hit) continue;
      // Position sanity check prevents cross-position false matches
      if (hit.position && sp.position && hit.position !== sp.position) continue;
      return hit;
    }
    return null;
  },

};
