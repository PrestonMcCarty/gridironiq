/**
 * Data Health Monitoring
 * =======================
 * Runs after every player load and produces a health report
 * surfaced in the DataStatusBanner and console.
 *
 * Health Score Components (0–100):
 *   Recency   (35%) — how fresh is the data vs expected refresh cadence
 *   Agreement (30%) — cross-source consistency (FC ADP vs derived, bye coverage)
 *   Coverage  (20%) — all 32 DST, kicker pool, no missing IDs
 *   Validity  (15%) — schema conformance, unique ranks, no null PPG
 */

import { validatePlayerPool } from "@/lib/data/playerSchema";

const WEIGHTS = { recency: 0.35, agreement: 0.30, coverage: 0.20, validity: 0.15 };

/**
 * Compute a comprehensive data health report.
 *
 * @param {Array}  players      — enriched player pool
 * @param {Object} meta         — { fetchedAt, season, week, byeWeekMapHealth }
 * @returns {Object} health report
 */
export function computeDataHealth(players, meta = {}) {
  const now = Date.now();

  // ── Recency score ────────────────────────────────────────────────────────
  const ageMs     = meta.fetchedAt ? now - meta.fetchedAt : 0;
  const ageMin    = ageMs / 60_000;
  const recency   = Math.max(0, Math.round(100 - (ageMin / 60) * 20)); // -20pts/hr

  // ── Agreement score ──────────────────────────────────────────────────────
  const fcCount      = players.filter(p => p.adpSource === "fantasycalc_rank").length;
  const estCount     = players.filter(p => p.adpSource === "estimated").length;
  const derivedCount = players.filter(p => p.adpSource === "derived").length;
  const total        = players.length || 1;

  // Higher FC coverage = better agreement
  const fcCoverage   = (fcCount / total) * 100;
  const byeCoverage  = meta.byeWeekMapHealth?.covered
    ? (meta.byeWeekMapHealth.covered / 32) * 100
    : 0;
  const agreement    = Math.round((fcCoverage * 0.6) + (byeCoverage * 0.4));

  // ── Coverage score ───────────────────────────────────────────────────────
  const dstCount  = players.filter(p => p.pos === "DST").length;
  const kCount    = players.filter(p => p.pos === "K").length;
  const dstScore  = Math.min(100, (dstCount / 32) * 100);
  const kScore    = Math.min(100, (kCount   / 32) * 100);
  const hasIds    = players.every(p => p.id) ? 100 : 60;
  const coverage  = Math.round((dstScore * 0.4) + (kScore * 0.2) + (hasIds * 0.4));

  // ── Validity score ───────────────────────────────────────────────────────
  const poolValidation = validatePlayerPool(players);
  const rankDupePenalty = poolValidation.rankDuplicates * 5;
  const adpDupePenalty  = poolValidation.adpDuplicates  * 2;
  const validity = Math.max(0, Math.min(100,
    poolValidation.overallScore - rankDupePenalty - adpDupePenalty
  ));

  // ── Overall score ────────────────────────────────────────────────────────
  const overall = Math.round(
    recency   * WEIGHTS.recency   +
    agreement * WEIGHTS.agreement +
    coverage  * WEIGHTS.coverage  +
    validity  * WEIGHTS.validity
  );

  const grade = overall >= 90 ? "A" : overall >= 75 ? "B" : overall >= 60 ? "C" : "D";

  // ── ADP validation ───────────────────────────────────────────────────────
  const adpValidation = {
    fcSourced:    fcCount,
    estimated:    estCount,
    derived:      derivedCount,
    duplicates:   poolValidation.adpDuplicates,
    coveragePct:  Math.round((fcCount / total) * 100),
  };

  // ── Rank validation ──────────────────────────────────────────────────────
  const overallRanks = players.map(p => p.overallRank).filter(Boolean);
  const rankValidation = {
    totalRanked:   overallRanks.length,
    isSequential:  overallRanks.length > 0 && Math.max(...overallRanks) === overallRanks.length,
    duplicates:    poolValidation.rankDuplicates,
    posRankCounts: {},
  };
  ["QB","RB","WR","TE","DST","K"].forEach(pos => {
    const posRanks = players.filter(p => p.pos === pos).map(p => p.posRank).filter(Boolean);
    const posDupes = posRanks.length - new Set(posRanks).size;
    rankValidation.posRankCounts[pos] = { count: posRanks.length, duplicates: posDupes };
  });

  // ── Projection validation ────────────────────────────────────────────────
  const projValidation = {
    sleeperProjected: players.filter(p => p.ppgSource === "sleeper_proj").length,
    seasonAvg:        players.filter(p => p.ppgSource === "season_avg").length,
    posEstimate:      players.filter(p => p.ppgSource === "pos_estimate").length,
    zeroPPG:          players.filter(p => p.ppg === 0).length,
    nullPPG:          players.filter(p => p.ppg == null).length,
  };

  // ── Flags ────────────────────────────────────────────────────────────────
  const flags = [];
  if (recency   < 50) flags.push({ severity: "warn",  msg: `Data is ${Math.round(ageMin)}min old — refresh recommended` });
  if (dstCount  < 30) flags.push({ severity: "error", msg: `Only ${dstCount}/32 DST teams loaded` });
  if (kCount    < 25) flags.push({ severity: "warn",  msg: `Only ${kCount} kickers loaded (expected 32+)` });
  if (poolValidation.rankDuplicates > 0) flags.push({ severity: "error", msg: `${poolValidation.rankDuplicates} duplicate overall ranks detected` });
  if (poolValidation.adpDuplicates  > 5) flags.push({ severity: "warn",  msg: `${poolValidation.adpDuplicates} duplicate ADP values` });
  if (byeCoverage < 80) flags.push({ severity: "warn",  msg: `Bye week data missing for ${32 - (meta.byeWeekMapHealth?.covered || 0)} teams` });
  if (projValidation.zeroPPG > 20) flags.push({ severity: "warn",  msg: `${projValidation.zeroPPG} players have 0 PPG projection` });
  if (derivedCount > total * 0.3) flags.push({ severity: "warn",  msg: `${derivedCount} players using derived ADP (>30% of pool)` });

  return {
    overall,
    grade,
    components: { recency, agreement, coverage, validity },
    adp:        adpValidation,
    ranks:      rankValidation,
    projections:projValidation,
    positions:  poolValidation.byPosition,
    flags,
    meta: {
      season:      meta.season,
      week:        meta.week,
      totalPlayers:players.length,
      fetchedAt:   meta.fetchedAt,
      byeWeeks:    meta.byeWeekMapHealth,
    },
  };
}

/** Format and log the health report to the browser console */
export function logHealthReport(report) {
  const { overall, grade, components, flags, meta, adp, ranks, projections } = report;

  console.group(`[GridironIQ] Data Health Report — Grade ${grade} (${overall}/100)`);
  console.info(`Season: ${meta.season}  Week: ${meta.week}  Players: ${meta.totalPlayers}`);
  console.info(`Components: Recency=${components.recency} Agreement=${components.agreement} Coverage=${components.coverage} Validity=${components.validity}`);

  console.group("ADP Validation");
  console.info(`FC-sourced: ${adp.fcSourced} (${adp.coveragePct}%)  Estimated: ${adp.estimated}  Derived: ${adp.derived}  Duplicates: ${adp.duplicates}`);
  console.groupEnd();

  console.group("Rank Validation");
  console.info(`Ranked: ${ranks.totalRanked}  Sequential: ${ranks.isSequential}  Duplicates: ${ranks.duplicates}`);
  Object.entries(ranks.posRankCounts).forEach(([pos, d]) =>
    console.info(`  ${pos}: ${d.count} players, ${d.duplicates} dup rank(s)`)
  );
  console.groupEnd();

  console.group("Projection Validation");
  console.info(`Sleeper: ${projections.sleeperProjected}  SeasonAvg: ${projections.seasonAvg}  PosEstimate: ${projections.posEstimate}  ZeroPPG: ${projections.zeroPPG}`);
  console.groupEnd();

  if (flags.length) {
    console.group(`⚠ Flags (${flags.length})`);
    flags.forEach(f => console[f.severity === "error" ? "error" : "warn"](`[${f.severity.toUpperCase()}] ${f.msg}`));
    console.groupEnd();
  } else {
    console.info("✓ No flags — all checks passed");
  }

  console.groupEnd();
  return report;
}
