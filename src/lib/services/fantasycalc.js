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

/**
 * Positional ADP fallback ranks by position tier.
 * Used when FantasyCalc has no ADP for a player (depth players, rookies).
 * Thresholds intentionally generous — we'd rather show approximate ADP
 * than the meaningless "99" placeholder.
 */
const POS_ADP_TIERS = {
  QB: [
    { maxRank: 1,  adp: 25  },
    { maxRank: 5,  adp: 60  },
    { maxRank: 12, adp: 120 },
    { maxRank: 24, adp: 200 },
  ],
  RB: [
    { maxRank: 3,  adp: 10  },
    { maxRank: 10, adp: 40  },
    { maxRank: 24, adp: 90  },
    { maxRank: 40, adp: 140 },
    { maxRank: 60, adp: 200 },
  ],
  WR: [
    { maxRank: 3,  adp: 15  },
    { maxRank: 10, adp: 45  },
    { maxRank: 24, adp: 90  },
    { maxRank: 40, adp: 140 },
    { maxRank: 60, adp: 200 },
  ],
  TE: [
    { maxRank: 1,  adp: 20  },
    { maxRank: 5,  adp: 70  },
    { maxRank: 12, adp: 120 },
    { maxRank: 24, adp: 180 },
  ],
  K:  [
    { maxRank: 12, adp: 160 },
  ],
};

function posAdpFallback(position, positionalRank) {
  if (!positionalRank) return null;
  const tiers = POS_ADP_TIERS[position] || [];
  for (const tier of tiers) {
    if (positionalRank <= tier.maxRank) return tier.adp;
  }
  return null;
}

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

        // ── Real ADP from FantasyCalc's overallPick field ──────────────
        // overallPick is the mean overall pick number across recent
        // real drafts tracked by FantasyCalc. This is the correct ADP.
        // The old formula (1001 - redraftValue) / 10 was wrong —
        // redraftValue is a trade value score, NOT a pick number.
        const overallAdp    = typeof d.overallPick    === "number" ? d.overallPick    : null;
        const positionalAdp = typeof d.positionalPick === "number" ? d.positionalPick : null;

        // adpDelta: negative = rising (being drafted earlier), positive = falling
        const adpDelta = typeof d.adpDelta === "number" ? d.adpDelta : null;
        const adpTrend = adpDelta === null   ? null
          : adpDelta < -0.5 ? "rising"
          : adpDelta >  0.5 ? "falling"
          : "stable";

        // Positional rank within this response (1-based) as a fallback
        // for computing approximate ADP when overallPick is missing
        const positionalRank = positionalAdp ? Math.ceil(positionalAdp) : null;

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

  /**
   * Compute a fallback ADP for players not in the FC dataset.
   * Uses positional rank within the enriched player array.
   * Returns null when no estimate is possible.
   */
  fallbackAdp(position, positionalRank) {
    return posAdpFallback(position, positionalRank);
  },
};
