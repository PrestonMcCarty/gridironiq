/**
 * GridironIQ Player Identity — Crosswalk Store
 * ==============================================
 * Runtime read layer for the crosswalk.
 *
 * Phase 1: crosswalk is built in-memory from the live Sleeper pool.
 * Phase 2+: crosswalk is loaded from a pre-built static artifact.
 *
 * Consumers call lookupBySleeperID / lookupByCanonicalId.
 * No consumer ever calls the builder directly.
 */

import { buildCrosswalk } from "@/lib/identity/crosswalkBuilder";
import { buildCanonicalId } from "@/lib/identity/crosswalkSchema";

// ── Module-level cache ─────────────────────────────────────────────────────
// The crosswalk is built once per session and cached here.
let _crosswalk   = null;
let _builtAt     = null;
let _report      = null;
let _quarantine  = [];
let _unmatched   = [];

// ── Build / initialise ─────────────────────────────────────────────────────

/**
 * Build or rebuild the crosswalk from a fresh Sleeper player pool.
 * Called by usePlayers after the Sleeper player fetch completes.
 *
 * @param {Object} sleeperPlayers
 * @param {Object} [options]  — forwarded to buildCrosswalk
 * @returns {CrosswalkBuildResult}
 */
export function initialiseCrosswalk(sleeperPlayers, options = {}) {
  const result = buildCrosswalk(sleeperPlayers, options);
  _crosswalk  = result.crosswalk;
  _builtAt    = Date.now();
  _report     = result.report;
  _quarantine = result.quarantine;
  _unmatched  = result.unmatched;
  return result;
}

// ── Read API ───────────────────────────────────────────────────────────────

/**
 * Look up a crosswalk entry by Sleeper player_id.
 * @param {string} sleeperPlayerId
 * @returns {CrosswalkEntry|null}
 */
export function lookupBySleeperID(sleeperPlayerId) {
  if (!_crosswalk) return null;
  const canonId = buildCanonicalId("skill", sleeperPlayerId);
  return _crosswalk[canonId] || null;
}

/**
 * Look up a crosswalk entry by canonical ID.
 * @param {string} canonicalId  — e.g. "giq:4046" or "giq:dst:KC"
 * @returns {CrosswalkEntry|null}
 */
export function lookupByCanonicalId(canonicalId) {
  return _crosswalk?.[canonicalId] || null;
}

/**
 * Look up a DST entry by team abbreviation.
 * @param {string} teamAbbr  — e.g. "KC"
 * @returns {CrosswalkEntry|null}
 */
export function lookupDST(teamAbbr) {
  if (!_crosswalk || !teamAbbr) return null;
  const canonId = buildCanonicalId("dst", teamAbbr.toUpperCase());
  return _crosswalk[canonId] || null;
}

/**
 * Get the canonical ID for a Sleeper player_id.
 * Returns null if crosswalk not yet built.
 */
export function getCanonicalId(sleeperPlayerId) {
  const entry = lookupBySleeperID(sleeperPlayerId);
  return entry?.canonical_id || null;
}

// ── Health / reporting ─────────────────────────────────────────────────────

export function getCrosswalkReport()    { return _report; }
export function getCrosswalkQuarantine(){ return _quarantine; }
export function getCrosswalkUnmatched() { return _unmatched; }
export function isCrosswalkReady()      { return _crosswalk !== null; }
export function getCrosswalkAge()       { return _builtAt ? Date.now() - _builtAt : null; }

/**
 * Summarise crosswalk health for the dataHealth report.
 * Returns a sub-score (0–100) and a flags array.
 */
export function getCrosswalkHealth() {
  if (!_crosswalk || !_report) {
    return { score: 0, flags: [{ severity: "error", msg: "Crosswalk not built" }] };
  }

  const entries = Object.values(_crosswalk);
  const total   = entries.length;
  const dstOk   = entries.filter(e => e.position === "DST").length;
  const lowConf = entries.filter(e => e.flags?.includes("LOW_CONFIDENCE")).length;
  const qLen    = _quarantine.length;
  const valFail = _report.validationFailures?.length || 0;

  const score = Math.max(0, Math.round(
    100
    - (Math.max(0, 32 - dstOk) * 2)     // -2 per missing DST
    - (lowConf / total) * 20             // up to -20 for low-confidence entries
    - qLen * 1                           // -1 per quarantined record
    - valFail * 5                        // -5 per schema failure
  ));

  const flags = _report.flags || [];
  return { score, flags, summary: _report.summary };
}

/**
 * Log the full crosswalk report to the browser console.
 */
export function logCrosswalkReport() {
  if (!_report) { console.warn("[GridironIQ] Crosswalk not built yet"); return; }

  const { summary, byPosition, flags, quarantineList, unmatchedList } = _report;
  const health = getCrosswalkHealth();

  console.group(`[GridironIQ] Player Identity Crosswalk — Health ${health.score}/100`);
  console.info("Summary:", summary);

  console.group("By Position");
  Object.entries(byPosition).forEach(([pos, d]) => {
    console.info(`  ${pos}: ${d.total} entries, verified=${d.verified}, lowConf=${d.lowConf}, nflverse=${d.nflverseLinked}`);
    if (d.missing?.length) console.warn(`    Missing: ${d.missing.join(", ")}`);
  });
  console.groupEnd();

  if (quarantineList?.length) {
    console.group(`⚠ Quarantine (${quarantineList.length} — need manual review)`);
    quarantineList.forEach(q =>
      console.warn(`  ${q.name} (${q.pos}/${q.team}) → candidates: ${q.candidates?.join(" | ")}`)
    );
    console.groupEnd();
  }

  if (unmatchedList?.length) {
    console.group(`✗ Unmatched (${unmatchedList.length})`);
    unmatchedList.slice(0, 20).forEach(u =>
      console.info(`  ${u.name} (${u.pos}/${u.team}) — ${u.reason} [${u.type}]`)
    );
    if (unmatchedList.length > 20) console.info(`  ... and ${unmatchedList.length - 20} more`);
    console.groupEnd();
  }

  if (flags.length) {
    console.group(`Flags (${flags.length})`);
    flags.forEach(f => console[f.severity === "error" ? "error" : "warn"](`[${f.severity.toUpperCase()}] ${f.msg}`));
    console.groupEnd();
  } else {
    console.info("✓ No flags");
  }

  console.groupEnd();
}
