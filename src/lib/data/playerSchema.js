/**
 * GridironIQ Canonical Player Schema
 * ====================================
 * Every field in the enriched player object is defined here.
 * Every consumer reads from this shape. No consumer calls external APIs directly.
 *
 * Provenance tags:
 *   source:      "sleeper" | "fantasycalc" | "underdog" | "computed" | "derived"
 *   confidence:  0.0–1.0
 *   stale:       boolean (true when past expected refresh window)
 */

export const POSITIONS = ["QB", "RB", "WR", "TE", "DST", "K"];

export const ADP_SOURCES = {
  FANTASYCALC: "fantasycalc",
  ESTIMATED:   "estimated",   // _positionalAdpFallback — interpolated from tier tables
  DERIVED:     "derived",     // overallRank + 0.1 — last resort backfill
};

export const PROJECTION_SOURCES = {
  SLEEPER_PROJ:  "sleeper_proj",   // Sleeper /projections endpoint
  SEASON_AVG:    "season_avg",     // Rolling average of last 8 weeks of actuals
  POS_ESTIMATE:  "pos_estimate",   // Positional estimate formula (pre-season floor)
};

/**
 * Canonical player shape — all fields documented.
 * Optional fields are marked with ?.
 *
 * Identity
 *   id              string   — Sleeper player_id (primary key throughout app)
 *   sleeperPlayerId string   — alias for id (legacy compat)
 *   name            string
 *   pos             string   — QB | RB | WR | TE | DST | K
 *   team            string   — NFL team abbreviation or "FA"
 *   status?         string   — "Active" | "Injured_Reserve" | null
 *   injury          string   — "Q" | "OUT" | "IR" | null
 *
 * Schedule — sourced from Sleeper player object fields
 *   bye?            number   — bye week (from sp.bye_week, Sleeper player field)
 *   opponent?       string   — current week opponent abbreviation
 *
 * Projection (ppg is the single projection field all engines use)
 *   ppg             number   — projected PPG (source tracked in ppgSource)
 *   ppgSource       string   — PROJECTION_SOURCES value
 *   seasonAvg       number   — rolling 8-week actual average
 *
 * Rankings (assigned in ADP Ranking Pass — authoritative, unique)
 *   overallRank     number   — unique 1..N
 *   posRank         number   — unique 1..N within position
 *
 * ADP (from FantasyCalc or fallback)
 *   adp             number   — overall pick number (never null after ranking pass)
 *   adpSource       string   — ADP_SOURCES value
 *   positionalAdp?  number
 *   adpTrend?       string   — "rising" | "falling" | "stable"
 *   adpDelta?       number   — pick movement
 *
 * Trade value
 *   fcValue?        number   — FantasyCalc redraft value 0–1000
 *   fcValueSource   string   — "fantasycalc" | "estimated" (K/DST have no real market)
 *
 * Analytics
 *   consistencyScore number   0–100
 *   opportunityScore number   0–100
 *   boomPct          number   0–100
 *   bustPct          number   0–100
 *   injuryRiskScore  number   0–100 (higher = safer)
 *   sosScore         number   0–100 current week SoS
 *   playoffSosScore  number   0–100 weeks 15-17 SoS (real future opponents)
 *   trend            string   "up" | "down" | "same"
 *   matchup          object   { grade, label, rank }
 *
 * Data health
 *   dataHealth       object   { score, flags, sources }  (populated by validator)
 */

// ── Validation helpers ────────────────────────────────────────────────────────

/** Validate a single player object — returns { valid, score, flags } */
export function validatePlayer(p) {
  const flags = [];
  let score   = 100;

  // Identity checks
  if (!p.id)   { flags.push("MISSING_ID");   score -= 30; }
  if (!p.name) { flags.push("MISSING_NAME"); score -= 20; }
  if (!POSITIONS.includes(p.pos)) { flags.push(`INVALID_POS:${p.pos}`); score -= 20; }

  // Rankings must be present and positive after ranking pass
  if (!p.overallRank || p.overallRank < 1) { flags.push("MISSING_OVERALL_RANK"); score -= 15; }
  if (!p.posRank     || p.posRank < 1)     { flags.push("MISSING_POS_RANK");     score -= 10; }

  // ADP
  if (p.adp == null)            { flags.push("MISSING_ADP"); score -= 10; }
  if (p.adpSource === "derived") score -= 5; // soft penalty — works but undesirable

  // Projection
  if (p.ppg == null || p.ppg < 0) { flags.push("INVALID_PPG"); score -= 15; }
  if (p.ppg === 0 && p.ppgSource === "pos_estimate") score -= 3; // floor estimate

  // Schedule
  if (!p.bye)      flags.push("MISSING_BYE");
  if (!p.opponent) flags.push("MISSING_OPPONENT");

  // Trade value
  if (p.fcValue == null && !["K","DST"].includes(p.pos)) {
    flags.push("MISSING_FC_VALUE"); score -= 5;
  }

  const valid = score >= 60 && !flags.some(f => f.startsWith("MISSING_ID") || f.startsWith("MISSING_NAME"));
  return { valid, score: Math.max(0, score), flags };
}

/** Run validation across the full player pool, return health report */
export function validatePlayerPool(players) {
  const results   = players.map(p => ({ id: p.id, name: p.name, pos: p.pos, ...validatePlayer(p) }));
  const byPos     = {};
  const allFlags  = {};

  POSITIONS.forEach(pos => {
    const group = results.filter(r => r.pos === pos);
    byPos[pos]  = {
      count:   group.length,
      avgScore: group.length ? Math.round(group.reduce((s, r) => s + r.score, 0) / group.length) : 0,
      issues:  group.filter(r => !r.valid).length,
    };
  });

  results.forEach(r => {
    r.flags.forEach(f => { allFlags[f] = (allFlags[f] || 0) + 1; });
  });

  // Check uniqueness of overallRank and posRank
  const overallRanks = players.map(p => p.overallRank).filter(Boolean);
  const rankDupes    = overallRanks.length - new Set(overallRanks).size;

  // ADP uniqueness
  const adps     = players.map(p => p.adp).filter(Boolean);
  const adpDupes = adps.length - new Set(adps).size;

  // DST coverage
  const dstCount = players.filter(p => p.pos === "DST").length;
  const kCount   = players.filter(p => p.pos === "K").length;

  const overallScore = Math.round(results.reduce((s, r) => s + r.score, 0) / (results.length || 1));

  return {
    totalPlayers:   players.length,
    overallScore,
    byPosition:     byPos,
    flagCounts:     allFlags,
    rankDuplicates: rankDupes,
    adpDuplicates:  adpDupes,
    dstCoverage:    { count: dstCount, expected: 32, gap: Math.max(0, 32 - dstCount) },
    kCoverage:      { count: kCount,   expected: 32, gap: Math.max(0, 32 - kCount)   },
    issues:         results.filter(r => !r.valid),
    grade:          overallScore >= 90 ? "A" : overallScore >= 75 ? "B" : overallScore >= 60 ? "C" : "D",
  };
}
