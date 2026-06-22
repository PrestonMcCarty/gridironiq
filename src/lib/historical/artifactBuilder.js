/**
 * GridironIQ Historical Artifact Builder
 * ========================================
 * Orchestrates the full Phase 2 build pipeline:
 *
 *   1. Fetch NFLverse 2024 stats CSV
 *   2. Group rows by GSIS ID
 *   3. Match each GSIS ID to a canonical Sleeper ID via the crosswalk
 *   4. Aggregate per-week rows into season totals
 *   5. Compute PPR / Half-PPR / Standard fantasy points
 *   6. Compute overall and positional finishes
 *   7. Validate the full record set
 *   8. Freeze as a versioned JSON artifact
 *
 * Output: historical_{season}.json
 *
 * This runs as a BUILD STEP — not at runtime for users.
 */

import { fetchNFLverseStats, groupByPlayer } from "@/lib/historical/nflverseIngestion";
import {
  aggregateSeasonStats, computeSeasonScores, computeFinishes,
  SCORING_ENGINE_VERSION,
} from "@/lib/historical/historicalScorer";
import { validateArtifact, logValidationReport } from "@/lib/historical/artifactValidator";
import {
  buildCrosswalk, buildSleeperIndexes,
} from "@/lib/identity/crosswalkBuilder";
import { matchNFLverseRecord } from "@/lib/identity/crosswalkMatcher";
import { normalizePosition, normalizeTeam } from "@/lib/identity/nameNormalizer";
import { buildCanonicalId, NFL_TEAMS } from "@/lib/identity/crosswalkSchema";
import { SleeperService } from "@/lib/services/sleeper";

// ── DST pts_allow source ──────────────────────────────────────────────────
// NFLverse player_stats CSV does not include pts_allow for DST.
// DST scoring uses sacks, interceptions, TDs, etc. which ARE present.
// pts_allow is available in nflverse-data/data/schedules.csv or
// can be derived from the opponent's points scored that week.
// For Phase 2 we score DST from the available stats (sack, int, def_td, etc.)
// and document pts_allow as a Phase 3 enhancement.
const DST_NOTE = "pts_allow sourced from schedules.csv in Phase 3; DST scored from sack/int/td components only";

// ── Main build function ───────────────────────────────────────────────────

/**
 * Build the historical artifact for a given season.
 *
 * @param {number} season         — e.g. 2024
 * @param {Object} [opts]
 * @param {string} [opts.overrideUrl]        — test with local file URL
 * @param {Object} [opts.manualOverrides]    — { gsis_id: sleeper_id }
 * @param {Object} [opts.knownIdBridges]     — { gsis_id: sleeper_id }
 * @param {boolean}[opts.dryRun]             — validate but don't return artifact
 * @returns {Promise<BuildResult>}
 */
export async function buildHistoricalArtifact(season, opts = {}) {
  const startMs = Date.now();
  console.group(`[ArtifactBuilder] Building historical_${season}.json`);

  // ── Step 1: Load Sleeper player pool (identity anchor) ─────────────────
  console.info("Step 1: Loading Sleeper player pool...");
  const sleeperPlayers = await SleeperService.getPlayers();
  if (!sleeperPlayers || Object.keys(sleeperPlayers).length === 0) {
    throw new Error("Could not load Sleeper player pool — required for crosswalk");
  }
  console.info(`  ✓ ${Object.keys(sleeperPlayers).length} Sleeper players loaded`);

  // ── Step 2: Build crosswalk indexes ────────────────────────────────────
  console.info("Step 2: Building crosswalk indexes...");
  const crosswalkResult = buildCrosswalk(sleeperPlayers, {
    knownIdBridges:  opts.knownIdBridges  || {},
    manualOverrides: opts.manualOverrides || {},
  });
  const indexes = buildSleeperIndexes(sleeperPlayers);
  console.info(`  ✓ Crosswalk: ${Object.keys(crosswalkResult.crosswalk).length} entries`);

  // ── Step 3: Fetch NFLverse stats ───────────────────────────────────────
  console.info(`Step 3: Fetching NFLverse ${season} player stats...`);
  const statRows = await fetchNFLverseStats(season, { overrideUrl: opts.overrideUrl });
  console.info(`  ✓ ${statRows.length} regular-season stat rows`);

  // ── Step 4: Group by player, match crosswalk ───────────────────────────
  console.info("Step 4: Matching players via crosswalk...");
  const grouped      = groupByPlayer(statRows);
  const records      = [];
  const matchReport  = { matched: 0, ambiguous: 0, unmatched: 0, dstAuto: 0 };
  const quarantine   = [];
  const unmatchedLog = [];

  // Track DST teams seen in stat rows for coverage check
  const dstTeamsSeen = new Set();

  Object.entries(grouped).forEach(([gsisId, rows]) => {
    const sample = rows[0];
    const pos    = normalizePosition(sample.position);
    const team   = normalizeTeam(sample.team);
    const name   = sample.display_name || sample.player_name || "";

    if (!pos) return; // non-fantasy position

    // DST: match by team abbreviation (always confidence 1.0)
    if (pos === "DST") {
      if (!team) return;
      dstTeamsSeen.add(team);
      const canonId  = buildCanonicalId("dst", team);
      const cwEntry  = crosswalkResult.crosswalk[canonId];
      const { stat_totals, games_played, games_active } = aggregateSeasonStats(rows, "DST");
      const scores = computeSeasonScores(stat_totals, games_played, "DST");

      records.push({
        canonical_id:   canonId,
        nflverse_id:    gsisId !== `anon:${name}:${team}` ? gsisId : null,
        season,
        position:       "DST",
        team,
        name:           cwEntry?.name || `${team} D/ST`,
        stat_totals,
        games_played,
        games_active,
        ...scores,
        overall_finish:   null, // filled by computeFinishes
        position_finish:  null,
        record_type:    "actual",
        finalized:      true,
        provenance: {
          source:          "nflverse",
          fetchedAt:       Date.now(),
          scoringEngine:   SCORING_ENGINE_VERSION,
          artifactVersion: `${season}.1`,
          notes:           DST_NOTE,
        },
      });
      matchReport.dstAuto++;
      return;
    }

    // Skill player + Kicker: match via tier cascade
    const nflRecord = {
      gsis_id:      gsisId.startsWith("anon:") ? null : gsisId,
      display_name: name,
      position:     sample.position,
      team:         sample.team,
      season,
    };
    const matchResult = matchNFLverseRecord(nflRecord, indexes, opts.knownIdBridges || {});

    if (matchResult.status === "matched") {
      matchReport.matched++;
      const canonId  = matchResult.canonical_id;
      const sleeperPid = matchResult.sleeper_id;
      const sp       = sleeperPlayers[sleeperPid];
      const { stat_totals, games_played, games_active } = aggregateSeasonStats(rows, pos);
      const scores = computeSeasonScores(stat_totals, games_played, pos);

      records.push({
        canonical_id:   canonId,
        nflverse_id:    nflRecord.gsis_id,
        sleeper_id:     sleeperPid,
        season,
        position:       pos,
        team,
        name:           sp?.full_name || name,
        stat_totals,
        games_played,
        games_active,
        ...scores,
        match_method:   matchResult.match_method,
        match_confidence: matchResult.confidence,
        overall_finish:   null,
        position_finish:  null,
        record_type:    "actual",
        finalized:      true,
        provenance: {
          source:          "nflverse",
          fetchedAt:       Date.now(),
          scoringEngine:   SCORING_ENGINE_VERSION,
          artifactVersion: `${season}.1`,
          matchMethod:     matchResult.match_method,
          matchConfidence: matchResult.confidence,
        },
      });

    } else if (matchResult.status === "ambiguous") {
      matchReport.ambiguous++;
      quarantine.push({ gsisId, name, pos, team, result: matchResult });

    } else {
      matchReport.unmatched++;
      unmatchedLog.push({ gsisId, name, pos, team, reason: matchResult.reason || matchResult.flags?.join(",") });
    }
  });

  // Seed any DST teams with no NFLverse rows (teams on bye every week = unusual,
  // but ensures all 32 are present in the artifact)
  NFL_TEAMS.forEach(abbr => {
    if (!dstTeamsSeen.has(abbr)) {
      const canonId = buildCanonicalId("dst", abbr);
      const cwEntry = crosswalkResult.crosswalk[canonId];
      records.push({
        canonical_id:  canonId,
        nflverse_id:   null,
        season,
        position:      "DST",
        team:          abbr,
        name:          cwEntry?.name || `${abbr} D/ST`,
        stat_totals:   {},
        games_played:  0,
        games_active:  0,
        fantasy_points_ppr: 0, fantasy_points_half: 0, fantasy_points_std: 0,
        ppg_ppr: 0, ppg_half: 0, ppg_std: 0,
        overall_finish: null, position_finish: null,
        record_type:   "actual",
        finalized:     true,
        provenance:    { source: "nflverse", fetchedAt: Date.now(), scoringEngine: SCORING_ENGINE_VERSION, artifactVersion: `${season}.1`, notes: "no_stat_rows_found" },
      });
    }
  });

  console.info(`  Matched: ${matchReport.matched} | DST auto: ${matchReport.dstAuto} | Ambiguous: ${matchReport.ambiguous} | Unmatched: ${matchReport.unmatched}`);
  if (quarantine.length) console.warn(`  ⚠ ${quarantine.length} records quarantined — add to manualOverrides to resolve`);

  // ── Step 5: Compute finishes ───────────────────────────────────────────
  console.info("Step 5: Computing overall and positional finishes...");
  computeFinishes(records, "PPR");
  console.info(`  ✓ Finishes computed for ${records.length} records`);

  // ── Step 6: Validate ───────────────────────────────────────────────────
  console.info("Step 6: Running validation suite...");
  const validation = validateArtifact(records, season);
  logValidationReport(validation, season);

  if (!validation.passed && !opts.dryRun) {
    console.groupEnd();
    throw new Error(
      `[ArtifactBuilder] Validation FAILED — ${validation.errors.length} errors. ` +
      `Artifact NOT frozen. Fix errors and rebuild.`
    );
  }

  // ── Step 7: Assemble artifact ──────────────────────────────────────────
  const artifact = {
    _meta: {
      season,
      record_type:     "actual",
      finalized:       true,
      built_at:        new Date().toISOString(),
      artifact_version:`${season}.1`,
      scoring_engine:  SCORING_ENGINE_VERSION,
      total_records:   records.length,
      build_ms:        Date.now() - startMs,
      match_report:    matchReport,
      quarantine_count:quarantine.length,
      unmatched_count: matchReport.unmatched,
      validation_passed:validation.passed,
      validation_warnings: validation.warnings.length,
    },
    // Index by canonical_id for O(1) lookup at runtime
    players: Object.fromEntries(records.map(r => [r.canonical_id, r])),
  };

  const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(1);
  console.info(`\n✓ historical_${season}.json built in ${elapsedSec}s — ${records.length} records`);
  console.groupEnd();

  return {
    artifact,
    validation,
    quarantine,
    unmatchedLog,
    matchReport,
    coverageReport: buildCoverageReport(records, season, matchReport, quarantine, unmatchedLog),
  };
}

// ── Coverage report ────────────────────────────────────────────────────────

function buildCoverageReport(records, season, matchReport, quarantine, unmatched) {
  const byPos = {};
  ["QB","RB","WR","TE","DST","K"].forEach(pos => {
    const group = records.filter(r => r.position === pos);
    const withGsis = group.filter(r => r.nflverse_id);
    byPos[pos] = {
      count:        group.length,
      nflverseLinked: withGsis.length,
      linkPct:      group.length ? Math.round(withGsis.length / group.length * 100) : 0,
      top5:         group
        .sort((a, b) => (a.position_finish || 999) - (b.position_finish || 999))
        .slice(0, 5)
        .map(r => ({ name: r.name, pos_finish: r.position_finish, ppg: r.ppg_ppr, pts: r.fantasy_points_ppr })),
    };
  });

  const totalLinked = records.filter(r => r.nflverse_id || r.position === "DST").length;

  return {
    season,
    totalRecords:   records.length,
    mappingPct:     Math.round(totalLinked / records.length * 100),
    byPosition:     byPos,
    quarantineCount:quarantine.length,
    unmatchedCount: unmatched.length,
    quarantineList: quarantine.map(q => ({
      name: q.name, pos: q.pos, team: q.team,
      candidates: (q.result?.candidates || []).map(c => c.name),
    })),
    unmatchedSample: unmatched.slice(0, 25).map(u => ({
      name: u.name, pos: u.pos, team: u.team, reason: u.reason,
    })),
  };
}
