/**
 * GridironIQ — Historical Artifact Verification Report
 * ======================================================
 * Generates a human-readable top-50 player list and positional
 * leaderboards so a maintainer can spot-check the artifact against
 * known 2024 results before committing it.
 *
 * Known 2024 top performers used as sanity anchors (PPR):
 *   QB1:  Josh Allen (BUF) ~400+ pts
 *   RB1:  Saquon Barkley (PHI) ~340+ pts
 *   WR1:  Ja'Marr Chase (CIN) ~320+ pts
 *   TE1:  Brock Bowers (LV)  ~250+ pts
 */

const KNOWN_2024_ANCHORS = {
  QB: [
    { name_fragment: "Allen",   pos_finish: 1, team: "BUF",  min_pts: 360 },
    { name_fragment: "Lamar",   pos_finish: 2, team: "BAL",  min_pts: 330 },
    { name_fragment: "Hurts",   pos_finish: 3, team: "PHI",  min_pts: 290 },
  ],
  RB: [
    { name_fragment: "Barkley", pos_finish: 1, team: "PHI",  min_pts: 300 },
    { name_fragment: "Henry",   pos_finish: 2, team: "TEN",  min_pts: 240 },
  ],
  WR: [
    { name_fragment: "Chase",   pos_finish: 1, team: "CIN",  min_pts: 280 },
    { name_fragment: "Jefferson", pos_finish: 2, team: "MIN",min_pts: 250 },
  ],
  TE: [
    { name_fragment: "Bowers",  pos_finish: 1, team: "LV",   min_pts: 220 },
  ],
};

/**
 * Generate the verification report from a built artifact.
 *
 * @param {Object} artifact  — output of buildHistoricalArtifact()
 * @param {number} season
 * @returns {VerificationReport}
 */
export function generateVerificationReport(artifact, season) {
  const records = Object.values(artifact.players || {});

  // ── Top 50 overall (PPR) ────────────────────────────────────────────────
  const top50 = records
    .filter(r => r.games_played > 0)
    .sort((a, b) => (a.overall_finish || 999) - (b.overall_finish || 999))
    .slice(0, 50)
    .map(r => ({
      overall_finish:  r.overall_finish,
      position:        r.position,
      position_finish: r.position_finish,
      name:            r.name,
      team:            r.team,
      games_played:    r.games_played,
      fantasy_points_ppr: r.fantasy_points_ppr,
      ppg_ppr:         r.ppg_ppr,
      nflverse_linked: !!r.nflverse_id,
      match_method:    r.match_method || "dst_abbr",
      match_confidence:r.match_confidence || 1.0,
    }));

  // ── Positional leaderboards (top 10 per position) ──────────────────────
  const leaderboards = {};
  ["QB","RB","WR","TE","DST","K"].forEach(pos => {
    leaderboards[pos] = records
      .filter(r => r.position === pos && r.games_played > 0)
      .sort((a, b) => (a.position_finish || 999) - (b.position_finish || 999))
      .slice(0, 10)
      .map(r => ({
        pos_rank:       r.position_finish,
        name:           r.name,
        team:           r.team,
        games:          r.games_played,
        total_ppr:      r.fantasy_points_ppr,
        ppg_ppr:        r.ppg_ppr,
        total_half:     r.fantasy_points_half,
        total_std:      r.fantasy_points_std,
      }));
  });

  // ── Anchor checks (sanity against known 2024 results) ──────────────────
  const anchorChecks = [];
  Object.entries(KNOWN_2024_ANCHORS).forEach(([pos, anchors]) => {
    anchors.forEach(anchor => {
      // Find by name fragment + team
      const match = records.find(r =>
        r.position === pos &&
        r.name?.toLowerCase().includes(anchor.name_fragment.toLowerCase()) &&
        r.team === anchor.team
      );

      const found    = !!match;
      const finishOk = found && match.position_finish <= anchor.pos_finish + 1;
      const ptsOk    = found && match.fantasy_points_ppr >= anchor.min_pts;

      anchorChecks.push({
        expected: `${anchor.name_fragment} (${pos}${anchor.pos_finish}, ${anchor.team}, ≥${anchor.min_pts}pts)`,
        found,
        actual_pos_finish: match?.position_finish,
        actual_pts_ppr:    match?.fantasy_points_ppr,
        finish_ok:         finishOk,
        pts_ok:            ptsOk,
        pass:              found && finishOk && ptsOk,
      });
    });
  });

  const anchorPass = anchorChecks.filter(c => c.pass).length;
  const anchorTotal = anchorChecks.length;

  // ── Scoring consistency spot-check ─────────────────────────────────────
  // PPR should always be ≥ Half-PPR ≥ Standard for skill players
  const scoringViolations = records.filter(r =>
    ["QB","RB","WR","TE"].includes(r.position) &&
    r.games_played > 0 &&
    (r.fantasy_points_ppr < r.fantasy_points_half ||
     r.fantasy_points_half < r.fantasy_points_std)
  ).map(r => ({ name: r.name, pos: r.position, ppr: r.fantasy_points_ppr, half: r.fantasy_points_half, std: r.fantasy_points_std }));

  return {
    season,
    top50,
    leaderboards,
    anchorChecks,
    anchorSummary: `${anchorPass}/${anchorTotal} anchor checks passed`,
    anchorPassed:  anchorPass === anchorTotal,
    scoringViolations,
    scoringConsistent: scoringViolations.length === 0,
    meta: artifact._meta,
  };
}

/**
 * Log the verification report to the browser console.
 * Called automatically by runBuildAndDownload().
 */
export function logVerificationReport(report) {
  const icon = report.anchorPassed && report.scoringConsistent ? "✓" : "⚠";
  console.group(`[Verification] ${icon} Season ${report.season}`);

  console.group("Anchor checks (known 2024 top performers)");
  report.anchorChecks.forEach(c => {
    console[c.pass ? "info" : "warn"](
      `${c.pass ? "✓" : "✗"} ${c.expected} → ` +
      `found=${c.found}, pos_finish=${c.actual_pos_finish}, pts=${c.actual_pts_ppr}`
    );
  });
  console.info(report.anchorSummary);
  console.groupEnd();

  if (report.scoringViolations.length) {
    console.group(`⚠ Scoring consistency violations (${report.scoringViolations.length})`);
    report.scoringViolations.forEach(v =>
      console.warn(`  ${v.name} (${v.pos}): PPR=${v.ppr} Half=${v.half} Std=${v.std}`)
    );
    console.groupEnd();
  } else {
    console.info("✓ Scoring consistency: PPR ≥ Half-PPR ≥ Standard for all skill players");
  }

  console.groupEnd();
}
