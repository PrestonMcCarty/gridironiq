/**
 * GridironIQ Historical Loader — Phase 2 Runtime
 * ================================================
 * Loads the pre-built historical artifact (historical_2024.json) at startup
 * and provides O(1) lookups keyed by canonical_id.
 *
 * The artifact is a static JSON file served from /public/data/.
 * It is built offline by scripts/build_historical_2024.mjs and committed.
 * This module never builds the artifact — it only reads it.
 *
 * Canonical ID shapes (must match artifactBuilder.js):
 *   Skill players: "giq:{sleeper_id}"     e.g. "giq:4046"
 *   DST:           "giq:dst:{TEAM}"       e.g. "giq:dst:KC"
 */

// ── Module-level cache ─────────────────────────────────────────────────────
let _artifact    = null;   // full artifact object (includes _meta)
let _index       = null;   // { [canonical_id]: record }
let _loadedAt    = null;
let _loadPromise = null;   // deduplicate concurrent calls

// ── Load ───────────────────────────────────────────────────────────────────

/**
 * Load historical_2024.json from the public data directory.
 * Safe to call multiple times — subsequent calls return the cached result.
 *
 * @returns {Promise<{ index: Object, meta: Object }>}
 */
export async function loadHistoricalArtifact() {
  if (_index) return { index: _index, meta: _artifact._meta };
  if (_loadPromise) return _loadPromise;

  _loadPromise = (async () => {
    try {
      const res = await fetch("/data/historical_2024.json");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (!data?.players || typeof data.players !== "object") {
        throw new Error("historical_2024.json is missing the 'players' index");
      }

      _artifact = data;
      _index    = data.players;   // { [canonical_id]: record }
      _loadedAt = Date.now();

      console.info(
        `[GridironIQ] ✓ historical_2024.json loaded — ` +
        `${Object.keys(_index).length} records, ` +
        `built ${data._meta?.built_at ?? "unknown"}`
      );
    } catch (e) {
      console.warn(`[GridironIQ] historical_2024.json not loaded: ${e.message}`);
      // Non-fatal — app works without historical data
      _index    = {};
      _artifact = { _meta: null, players: {} };
    }
    _loadPromise = null;
    return { index: _index, meta: _artifact._meta };
  })();

  return _loadPromise;
}

// ── Lookup API ─────────────────────────────────────────────────────────────

/**
 * Look up a historical record by canonical_id.
 * Returns null if the artifact is not loaded or the player has no record.
 *
 * @param {string} canonicalId
 * @returns {Object|null}
 */
export function lookupHistorical(canonicalId) {
  return _index?.[canonicalId] ?? null;
}

/**
 * Returns true if the artifact has been loaded (even if empty).
 */
export function isHistoricalReady() {
  return _index !== null;
}

/**
 * Returns the artifact _meta block, or null if not loaded.
 */
export function getHistoricalMeta() {
  return _artifact?._meta ?? null;
}

// ── Coverage report ────────────────────────────────────────────────────────

/**
 * Build and log a coverage report after the player pipeline has been enriched.
 *
 * @param {Array}  players        — enriched player array (post-join)
 * @param {number} totalPool      — total player objects before historical join
 * @param {number} matched        — players that received a historical record
 * @param {Object} byPosition     — { QB: { matched, total }, ... }
 */
export function logHistoricalCoverageReport(players, totalPool, matched, byPosition) {
  const coveragePct = totalPool > 0 ? Math.round((matched / totalPool) * 100) : 0;

  console.group("[GridironIQ] Historical 2024 Coverage Report");
  console.info(`  Total players in pool : ${totalPool}`);
  console.info(`  Historical matches    : ${matched}`);
  console.info(`  Unmatched             : ${totalPool - matched}`);
  console.info(`  Coverage              : ${coveragePct}%`);

  if (byPosition) {
    console.group("  By position");
    Object.entries(byPosition).forEach(([pos, d]) => {
      const pct = d.total > 0 ? Math.round((d.matched / d.total) * 100) : 0;
      const flag = pct < 60 ? " ⚠" : pct >= 85 ? " ✓" : "";
      console.info(`    ${pos.padEnd(4)} ${d.matched}/${d.total} (${pct}%)${flag}`);
    });
    console.groupEnd();
  }

  if (coveragePct < 50) {
    console.warn("  ⚠ Coverage below 50% — historical artifact may be stale or mismatched");
  }

  console.groupEnd();

  // Structured summary returned for DataStatusBanner / debug report
  return {
    totalPool,
    matched,
    unmatched:   totalPool - matched,
    coveragePct,
    byPosition,
  };
}
