/**
 * GridironIQ — Phase 2 Build Entry Point
 * ========================================
 * Builds historical_2024.json from NFLverse data.
 *
 * Usage (browser console or build script):
 *   import { build2024Artifact } from "@/lib/historical/historical_2024_builder";
 *   const result = await build2024Artifact();
 *   console.log(result.coverageReport);
 *   // Download: downloadArtifact(result.artifact, "historical_2024.json");
 *
 * The output JSON is committed to /public/data/historical_2024.json
 * and served as a static asset. It is NEVER regenerated at runtime.
 */

import { buildHistoricalArtifact } from "@/lib/historical/artifactBuilder";
import { generateVerificationReport } from "@/lib/historical/verificationReport";

// ── Known ID bridges ──────────────────────────────────────────────────────
// Pre-confirmed GSIS→Sleeper mappings for players where name matching
// is ambiguous. Add entries here when the crosswalk quarantine reports
// an ambiguous match that requires manual resolution.
//
// Format: { "gsis_id": "sleeper_player_id" }
const KNOWN_ID_BRIDGES_2024 = {
  // Example (real mappings populated from crosswalk quarantine report):
  // "00-0038000": "11638",   // Brock Bowers — if ambiguous
};

// ── Manual overrides ─────────────────────────────────────────────────────
// Human-confirmed GSIS→Sleeper mappings that override the tier cascade.
// Used after reviewing the quarantine report.
const MANUAL_OVERRIDES_2024 = {};

// ── Build ──────────────────────────────────────────────────────────────────

/**
 * Build the 2024 historical artifact.
 * @returns {Promise<Build2024Result>}
 */
export async function build2024Artifact(opts = {}) {
  const result = await buildHistoricalArtifact(2024, {
    knownIdBridges:  KNOWN_ID_BRIDGES_2024,
    manualOverrides: MANUAL_OVERRIDES_2024,
    dryRun:          opts.dryRun || false,
    overrideUrl:     opts.overrideUrl,
  });

  // Generate top-50 verification report
  const verification = generateVerificationReport(result.artifact, 2024);

  return {
    ...result,
    verification,
  };
}

/**
 * Download the artifact as a JSON file in the browser.
 * Paste result into /public/data/historical_2024.json.
 */
export function downloadArtifact(artifact, filename = "historical_2024.json") {
  if (typeof window === "undefined") {
    console.info("[Build2024] In Node: write artifact to /public/data/historical_2024.json");
    return;
  }
  const blob = new Blob([JSON.stringify(artifact, null, 2)], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  console.info(`[Build2024] Downloaded ${filename}`);
}

/**
 * Run in browser console to execute the full build and download the artifact.
 * Copy-paste into DevTools console after importing the module.
 */
export async function runBuildAndDownload() {
  console.info("[Build2024] Starting full 2024 historical build...");
  const result = await build2024Artifact();

  console.group("[Build2024] Coverage Report");
  console.table(Object.entries(result.coverageReport.byPosition).map(([pos, d]) => ({
    Position: pos, Count: d.count, "NFLverse Linked": d.nflverseLinked, "Link %": d.linkPct + "%",
  })));
  console.info(`Overall mapping: ${result.coverageReport.mappingPct}%`);
  console.groupEnd();

  console.group("[Build2024] Verification Report — Top 50");
  console.table(result.verification.top50.map(r => ({
    Rank: r.overall_finish, Name: r.name, Pos: r.position,
    PosRank: `${r.position}${r.position_finish}`,
    PPG: r.ppg_ppr, TotalPts: r.fantasy_points_ppr,
  })));
  console.groupEnd();

  if (result.coverageReport.quarantineList.length) {
    console.group("[Build2024] Quarantine — needs manual review");
    console.table(result.coverageReport.quarantineList);
    console.groupEnd();
  }

  if (result.coverageReport.unmatchedSample.length) {
    console.group("[Build2024] Unmatched sample (first 25)");
    console.table(result.coverageReport.unmatchedSample);
    console.groupEnd();
  }

  if (!result.validation.passed) {
    console.error("[Build2024] Validation FAILED — do NOT commit this artifact");
    return result;
  }

  downloadArtifact(result.artifact);
  console.info("[Build2024] ✓ Build complete — review and commit /public/data/historical_2024.json");
  return result;
}
