/**
 * GridironIQ Player Identity — Crosswalk Builder
 * ================================================
 * Orchestrates a full crosswalk build pass:
 *   1. Build Sleeper indexes from the live player pool
 *   2. Match every NFLverse record through the tier cascade
 *   3. Write accepted matches to the crosswalk table
 *   4. Route ambiguous / low-confidence matches to the quarantine queue
 *   5. Return a coverage + validation report
 *
 * At runtime, this module is called ONCE per season build, not per user load.
 * For the Phase 1 implementation, it runs against the live Sleeper pool
 * (which is already fetched by usePlayers) to produce the crosswalk that
 * future historical phases will use.
 */

import {
  CONFIDENCE, FLAGS, CANONICAL_POSITIONS, NFL_TEAMS,
  buildCanonicalId, validateCrosswalkEntry,
} from "./crosswalkSchema.js";
import { normalizePosition, normalizeTeam } from "./nameNormalizer.js";
import { buildSleeperIndexes, matchNFLverseRecord } from "./crosswalkMatcher.js";

// ── DST auto-entries ───────────────────────────────────────────────────────
// All 32 DST entries are deterministic — no matching needed.
// These are written directly with confidence 1.0.
const DST_CANONICAL = {
  ARI: "Arizona Cardinals D/ST",   ATL: "Atlanta Falcons D/ST",
  BAL: "Baltimore Ravens D/ST",    BUF: "Buffalo Bills D/ST",
  CAR: "Carolina Panthers D/ST",   CHI: "Chicago Bears D/ST",
  CIN: "Cincinnati Bengals D/ST",  CLE: "Cleveland Browns D/ST",
  DAL: "Dallas Cowboys D/ST",      DEN: "Denver Broncos D/ST",
  DET: "Detroit Lions D/ST",       GB:  "Green Bay Packers D/ST",
  HOU: "Houston Texans D/ST",      IND: "Indianapolis Colts D/ST",
  JAX: "Jacksonville Jaguars D/ST",KC:  "Kansas City Chiefs D/ST",
  LAC: "Los Angeles Chargers D/ST",LAR: "Los Angeles Rams D/ST",
  LV:  "Las Vegas Raiders D/ST",   MIA: "Miami Dolphins D/ST",
  MIN: "Minnesota Vikings D/ST",   NE:  "New England Patriots D/ST",
  NO:  "New Orleans Saints D/ST",  NYG: "New York Giants D/ST",
  NYJ: "New York Jets D/ST",       PHI: "Philadelphia Eagles D/ST",
  PIT: "Pittsburgh Steelers D/ST", SEA: "Seattle Seahawks D/ST",
  SF:  "San Francisco 49ers D/ST", TB:  "Tampa Bay Buccaneers D/ST",
  TEN: "Tennessee Titans D/ST",    WAS: "Washington Commanders D/ST",
};

// ── Main builder ───────────────────────────────────────────────────────────

/**
 * Build the complete crosswalk from a Sleeper player pool.
 *
 * In Phase 1, NFLverse records are not yet loaded — the builder runs
 * against the Sleeper pool itself to:
 *   (a) establish canonical IDs for every live player
 *   (b) build the index structures future phases will use for NFLverse matching
 *   (c) seed all 32 DST entries with confidence 1.0
 *   (d) produce a full coverage + validation report
 *
 * @param {Object} sleeperPlayers  — raw dict from Sleeper /v1/players/nfl
 * @param {Object} [options]
 * @param {Object} [options.knownIdBridges]  — { gsis_id: sleeper_id } pre-confirmed maps
 * @param {Array}  [options.nflverseRecords] — NFLverse rows if available (Phase 2+)
 * @param {Object} [options.manualOverrides] — { gsis_id: sleeper_id } human confirmations
 * @returns {CrosswalkBuildResult}
 */
export function buildCrosswalk(sleeperPlayers, options = {}) {
  const {
    knownIdBridges  = {},
    nflverseRecords = [],   // empty in Phase 1
    manualOverrides = {},
  } = options;

  const crosswalk   = {};   // canonical_id → CrosswalkEntry
  const quarantine  = [];   // ambiguous / low-confidence entries
  const unmatched   = [];   // nothing found

  // ── Step 1: Build Sleeper indexes ──────────────────────────────────────
  const indexes = buildSleeperIndexes(sleeperPlayers);

  // ── Step 2: Seed all 32 DST entries (deterministic, always 1.0) ────────
  NFL_TEAMS.forEach(abbr => {
    const sleeperPid = indexes.dstByTeam[abbr];
    const canonId    = buildCanonicalId("dst", abbr);
    const entry = {
      canonical_id:    canonId,
      sleeper_id:      sleeperPid || null,
      nflverse_id:     null,       // filled in Phase 2
      fantasycalc_id:  null,
      position:        "DST",
      team:            abbr,
      name:            DST_CANONICAL[abbr] || `${abbr} D/ST`,
      match_method:    "dst_abbr",
      confidence:      1.0,
      verified:        true,
      flags:           sleeperPid ? [] : ["SLEEPER_DST_NOT_FOUND"],
      last_resolved:   Date.now(),
    };
    crosswalk[canonId] = entry;
  });

  // ── Step 3: Seed all live Sleeper players with canonical IDs ───────────
  // In Phase 1, Sleeper IS the identity source — every player gets a
  // canonical ID derived directly from their Sleeper player_id.
  // Confidence = 1.0 (Sleeper is the anchor).
  Object.entries(sleeperPlayers).forEach(([pid, sp]) => {
    const pos = normalizePosition(sp.position);
    if (!pos || pos === "DST") return; // DST handled above; IDP skipped

    const team  = normalizeTeam(sp.team || sp.fantasy_team);
    const name  = sp.full_name || `${sp.first_name || ""} ${sp.last_name || ""}`.trim();
    if (!name) return;

    const canonId = buildCanonicalId("skill", pid);
    const isKicker = pos === "K";

    const entry = {
      canonical_id:    canonId,
      sleeper_id:      pid,
      nflverse_id:     null,       // filled in Phase 2
      fantasycalc_id:  null,       // filled when FC data matches
      fantasypros_id:  null,
      underdog_id:     null,
      position:        pos,
      team:            team || "FA",
      name,
      match_method:    "exact_id", // Sleeper is the anchor; this is not a "match"
      confidence:      1.0,
      verified:        true,
      flags:           isKicker ? [FLAGS.EXPECTED_SPARSE] : [],
      last_resolved:   Date.now(),
    };
    crosswalk[canonId] = entry;
  });

  // ── Step 4: Match NFLverse records (Phase 2+ — runs when records present) ─
  const nflverseResults = {
    matched:   [],
    ambiguous: [],
    unmatched: [],
  };

  nflverseRecords.forEach(record => {
    // Manual overrides take priority
    if (manualOverrides[record.gsis_id]) {
      const pid     = manualOverrides[record.gsis_id];
      const canonId = buildCanonicalId("skill", pid);
      if (crosswalk[canonId]) {
        crosswalk[canonId].nflverse_id   = record.gsis_id;
        crosswalk[canonId].match_method  = "manual";
        crosswalk[canonId].verified      = true;
        nflverseResults.matched.push({ record, result: { status: "matched", match_method: "manual", confidence: 1.0 } });
      }
      return;
    }

    const result = matchNFLverseRecord(record, indexes, knownIdBridges);

    if (result.status === "matched") {
      const canonId = result.canonical_id;
      if (crosswalk[canonId]) {
        crosswalk[canonId].nflverse_id = record.gsis_id;
        // Lower confidence if the match was below auto-accept
        if (result.confidence < CONFIDENCE.AUTO_ACCEPT) {
          crosswalk[canonId].confidence  = Math.min(crosswalk[canonId].confidence, result.confidence);
          crosswalk[canonId].flags       = [...new Set([...crosswalk[canonId].flags, FLAGS.LOW_CONFIDENCE])];
        }
      }
      nflverseResults.matched.push({ record, result });

    } else if (result.status === "ambiguous") {
      quarantine.push({
        type:      "ambiguous",
        record,
        result,
        action:    "needs_manual_review",
        guideline: "Examine candidates, confirm correct Sleeper ID, add to manualOverrides",
      });
      nflverseResults.ambiguous.push({ record, result });

    } else {
      // Check if this could be a rookie (not in Sleeper's live pool)
      const pos = normalizePosition(record.position);
      const isLikelyRookie = pos && !nflverseResults.matched.find(
        m => m.record.gsis_id === record.gsis_id
      );
      unmatched.push({
        type:    isLikelyRookie ? "likely_rookie_or_retired" : "unmatched",
        record,
        result,
      });
      nflverseResults.unmatched.push({ record, result });
    }
  });

  // ── Step 5: Validate all entries ──────────────────────────────────────
  const validationIssues = [];
  Object.values(crosswalk).forEach(entry => {
    const { valid, issues } = validateCrosswalkEntry(entry);
    if (!valid) validationIssues.push({ entry, issues });
  });

  // ── Step 6: Coverage report ────────────────────────────────────────────
  const report = _buildReport(crosswalk, quarantine, unmatched, nflverseResults, validationIssues);

  return {
    crosswalk,
    quarantine,
    unmatched,
    nflverseResults,
    validationIssues,
    report,
  };
}

// ── Report builder ─────────────────────────────────────────────────────────

function _buildReport(crosswalk, quarantine, unmatched, nflverse, validationIssues) {
  const entries     = Object.values(crosswalk);
  const total       = entries.length;
  const byPos       = {};

  CANONICAL_POSITIONS.forEach(pos => {
    const group = entries.filter(e => e.position === pos);
    byPos[pos] = {
      total:        group.length,
      verified:     group.filter(e => e.verified).length,
      lowConf:      group.filter(e => e.flags.includes(FLAGS.LOW_CONFIDENCE)).length,
      nflverseLinked: group.filter(e => e.nflverse_id).length,
      missing:      pos === "DST" ? NFL_TEAMS.filter(t => !group.find(e => e.team === t)) : [],
    };
  });

  const dstCoverage    = (byPos.DST?.total    || 0) / 32 * 100;
  const kCoverage      = (byPos.K?.total      || 0);
  const hasNFLverse    = nflverse.matched.length > 0;
  const nflTotalInput  = nflverse.matched.length + nflverse.ambiguous.length + nflverse.unmatched.length;
  const nflMatchRate   = nflTotalInput
    ? Math.round(nflverse.matched.length / nflTotalInput * 100) : null;

  const flags = [];
  if (dstCoverage < 100)    flags.push({ severity: "error", msg: `DST coverage ${dstCoverage.toFixed(0)}% — ${32 - (byPos.DST?.total||0)} teams missing` });
  if (kCoverage < 25)       flags.push({ severity: "warn",  msg: `Only ${kCoverage} kickers in crosswalk` });
  if (quarantine.length > 0)flags.push({ severity: "warn",  msg: `${quarantine.length} ambiguous matches need manual review` });
  if (validationIssues.length > 0) flags.push({ severity: "error", msg: `${validationIssues.length} schema validation failures` });

  return {
    summary: {
      totalEntries:   total,
      dstCoverage:    `${dstCoverage.toFixed(0)}% (${byPos.DST?.total||0}/32)`,
      kCount:         kCoverage,
      nflverseLinked: hasNFLverse ? `${nflMatchRate}% (${nflverse.matched.length}/${nflTotalInput})` : "Phase 2 — not yet run",
      quarantined:    quarantine.length,
      unmatched:      unmatched.length,
      validationOk:   validationIssues.length === 0,
    },
    byPosition:      byPos,
    flags,
    quarantineList:  quarantine.map(q => ({
      name:       q.record?.display_name || q.record?.full_name,
      pos:        q.record?.position,
      team:       q.record?.team,
      candidates: (q.result?.candidates || []).map(c => `${c.name} (${c.team}) sim=${c.sim?.toFixed(2)}`),
      action:     q.action,
    })),
    unmatchedList: unmatched.map(u => ({
      name:   u.record?.display_name,
      pos:    u.record?.position,
      team:   u.record?.team,
      reason: u.result?.reason || u.result?.flags?.join(","),
      type:   u.type,
    })),
    validationFailures: validationIssues.map(v => ({
      canonical_id: v.entry.canonical_id,
      issues:       v.issues,
    })),
  };
}
