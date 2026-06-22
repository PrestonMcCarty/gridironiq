/**
 * GridironIQ Historical Artifact Validator
 * ==========================================
 * Runs the full validation suite on a set of HistoricalSeasonRecords
 * before the artifact is frozen.
 *
 * Three validation tiers:
 *   1. Structural  — schema conformance, required fields, value ranges
 *   2. Finish      — uniqueness, contiguity, plausibility
 *   3. Coverage    — position counts, DST completeness, crosswalk links
 *
 * A build FAILS (does not freeze) if any Tier 1 or Tier 2 check fails.
 * Tier 3 failures produce warnings, not build failures.
 */

const REQUIRED_FIELDS = [
  "canonical_id","season","position","team",
  "stat_totals","games_played",
  "fantasy_points_ppr","fantasy_points_half","fantasy_points_std",
  "ppg_ppr","ppg_half","ppg_std",
  "overall_finish","position_finish",
  "record_type","finalized","provenance",
];

const POSITIONS = ["QB","RB","WR","TE","DST","K"];

const NFL_TEAMS = [
  "ARI","ATL","BAL","BUF","CAR","CHI","CIN","CLE","DAL","DEN",
  "DET","GB","HOU","IND","JAX","KC","LAC","LAR","LV","MIA",
  "MIN","NE","NO","NYG","NYJ","PHI","PIT","SEA","SF","TB","TEN","WAS",
];

/**
 * Validate a full set of HistoricalSeasonRecords.
 *
 * @param {Object[]} records
 * @param {number}   season
 * @returns {{ passed, errors, warnings, report }}
 */
export function validateArtifact(records, season) {
  const errors   = [];
  const warnings = [];

  // ── Tier 1: Structural ─────────────────────────────────────────────────
  records.forEach((r, idx) => {
    const ctx = `record[${idx}] ${r.canonical_id || "NO_ID"}`;

    // Required fields
    REQUIRED_FIELDS.forEach(f => {
      if (r[f] === undefined || r[f] === null) {
        errors.push(`${ctx}: missing required field "${f}"`);
      }
    });

    // Season matches
    if (r.season !== season) {
      errors.push(`${ctx}: season mismatch — expected ${season}, got ${r.season}`);
    }

    // Valid position
    if (!POSITIONS.includes(r.position)) {
      errors.push(`${ctx}: invalid position "${r.position}"`);
    }

    // Games played in valid range
    if (typeof r.games_played !== "number" || r.games_played < 0 || r.games_played > 18) {
      errors.push(`${ctx}: games_played out of range: ${r.games_played}`);
    }

    // Points non-negative
    ["fantasy_points_ppr","fantasy_points_half","fantasy_points_std"].forEach(f => {
      if (typeof r[f] === "number" && r[f] < -50) {
        errors.push(`${ctx}: ${f} implausibly negative: ${r[f]}`);
      }
    });

    // PPG consistent with total / games
    if (r.games_played > 0) {
      const expectedPPG = parseFloat((r.fantasy_points_ppr / r.games_played).toFixed(1));
      const actualPPG   = parseFloat(r.ppg_ppr.toFixed(1));
      if (Math.abs(expectedPPG - actualPPG) > 0.5) {
        errors.push(`${ctx}: ppg_ppr mismatch — total/games=${expectedPPG}, stored=${actualPPG}`);
      }
    }

    // record_type must be "actual"
    if (r.record_type !== "actual") {
      errors.push(`${ctx}: record_type must be "actual", got "${r.record_type}"`);
    }

    // finalized must be true
    if (r.finalized !== true) {
      errors.push(`${ctx}: finalized must be true`);
    }

    // Provenance must have source and scoringEngine
    if (!r.provenance?.source) errors.push(`${ctx}: provenance.source missing`);
    if (!r.provenance?.scoringEngine) errors.push(`${ctx}: provenance.scoringEngine missing`);

    // Canonical ID format
    if (r.canonical_id && !r.canonical_id.startsWith("giq:")) {
      errors.push(`${ctx}: canonical_id must start with "giq:"`);
    }
  });

  // ── Tier 2: Finish integrity ───────────────────────────────────────────

  // Overall finish: must be unique 1..N
  const overallFinishes = records.map(r => r.overall_finish).filter(Boolean);
  const overallSet      = new Set(overallFinishes);
  if (overallSet.size !== records.length) {
    errors.push(`Finish integrity: ${records.length - overallSet.size} duplicate overall_finish values`);
  }
  const maxOverall = Math.max(...overallFinishes);
  if (maxOverall !== records.length) {
    errors.push(`Finish integrity: max overall_finish=${maxOverall} but record count=${records.length}`);
  }

  // Position finish: must be unique within each position
  POSITIONS.forEach(pos => {
    const group    = records.filter(r => r.position === pos);
    const finishes = group.map(r => r.position_finish).filter(Boolean);
    const fSet     = new Set(finishes);
    if (fSet.size !== group.length) {
      errors.push(`Finish integrity [${pos}]: ${group.length - fSet.size} duplicate position_finish values`);
    }
  });

  // Plausibility: #1 overall PPR scorer should be a top-3 position finisher
  const top1 = records.find(r => r.overall_finish === 1);
  if (top1 && top1.position_finish > 3) {
    warnings.push(`Plausibility: overall #1 (${top1.canonical_id}) has position_finish=${top1.position_finish} — unexpected`);
  }

  // ── Tier 3: Coverage ───────────────────────────────────────────────────

  // DST: all 32 teams should be present
  const dstRecords = records.filter(r => r.position === "DST");
  const dstTeams   = new Set(dstRecords.map(r => r.team));
  const missingDST = NFL_TEAMS.filter(t => !dstTeams.has(t));
  if (missingDST.length > 0) {
    warnings.push(`Coverage: Missing DST teams: ${missingDST.join(", ")}`);
  }

  // K: expect at least 30
  const kCount = records.filter(r => r.position === "K").length;
  if (kCount < 30) {
    warnings.push(`Coverage: Only ${kCount} kickers (expected ≥30)`);
  }

  // NFLverse crosswalk: warn if many records have no nflverse_id
  const noGsis = records.filter(r => !r.nflverse_id && r.position !== "DST").length;
  const skillTotal = records.filter(r => r.position !== "DST").length;
  if (skillTotal > 0 && noGsis / skillTotal > 0.05) {
    warnings.push(`Crosswalk: ${noGsis}/${skillTotal} skill players missing nflverse_id (>${Math.round(noGsis/skillTotal*100)}%)`);
  }

  // Position counts — warn if obviously thin
  const posCounts = {};
  POSITIONS.forEach(pos => { posCounts[pos] = records.filter(r => r.position === pos).length; });
  const MINIMUMS  = { QB: 30, RB: 60, WR: 80, TE: 30, DST: 32, K: 30 };
  POSITIONS.forEach(pos => {
    if (posCounts[pos] < MINIMUMS[pos]) {
      warnings.push(`Coverage: ${pos} count=${posCounts[pos]} below minimum ${MINIMUMS[pos]}`);
    }
  });

  return {
    passed:   errors.length === 0,
    errors,
    warnings,
    report: {
      season,
      totalRecords: records.length,
      byPosition:   posCounts,
      dstCoverage:  `${dstTeams.size}/32`,
      kCount,
      crosswalkGap: noGsis,
      finishChecks: {
        overallUnique:    overallSet.size === records.length,
        positionUnique:   POSITIONS.every(pos => {
          const g = records.filter(r => r.position === pos);
          return new Set(g.map(r => r.position_finish)).size === g.length;
        }),
      },
      errorCount:   errors.length,
      warningCount: warnings.length,
    },
  };
}

/**
 * Format and log the validation report.
 */
export function logValidationReport(result, season) {
  const icon = result.passed ? "✓" : "✗";
  console.group(`[HistoricalArtifact] ${icon} Validation — Season ${season} (${result.passed ? "PASSED" : "FAILED"})`);
  console.info("Report:", result.report);

  if (result.errors.length) {
    console.group(`✗ Errors (${result.errors.length}) — BUILD BLOCKED`);
    result.errors.forEach(e => console.error(" ", e));
    console.groupEnd();
  }
  if (result.warnings.length) {
    console.group(`⚠ Warnings (${result.warnings.length})`);
    result.warnings.forEach(w => console.warn(" ", w));
    console.groupEnd();
  }
  if (!result.errors.length && !result.warnings.length) {
    console.info("✓ All checks passed — no issues found");
  }
  console.groupEnd();
}
