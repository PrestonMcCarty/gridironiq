/**
 * GridironIQ Player Identity — Crosswalk Matcher
 * ================================================
 * Implements the tiered matching cascade that resolves NFLverse records
 * to canonical Sleeper IDs.
 *
 * Tier 0  exact_id      1.00  direct source ID bridge
 * Tier 1  name_team_pos 0.95  normalized name + team + position, unique
 * Tier 2  name_pos      0.80  name + position, team mismatch tolerated
 * Tier 3  fuzzy         0.65  fuzzy name + position, unique
 * DST     dst_abbr      1.00  team abbreviation, deterministic
 *
 * A match is only accepted when UNIQUE at its tier.
 * Ambiguity always demotes to the quarantine queue — never auto-picks.
 */

import {
  MATCH_METHOD, METHOD_CONFIDENCE, CONFIDENCE, FLAGS,
  buildCanonicalId, CANONICAL_POSITIONS,
} from "./crosswalkSchema.js";
import {
  buildNameKeys, normalizePosition, normalizeTeam, nameSimilarity,
} from "./nameNormalizer.js";

// ── Internal types (JSDoc) ─────────────────────────────────────────────────
/**
 * @typedef {Object} SleeperRecord
 * @property {string}  player_id
 * @property {string}  full_name
 * @property {string}  first_name
 * @property {string}  last_name
 * @property {string}  position
 * @property {string}  team
 */

/**
 * @typedef {Object} NFLverseRecord
 * @property {string}  gsis_id       — NFLverse GSIS ID
 * @property {string}  display_name
 * @property {string}  position
 * @property {string}  team
 * @property {number}  season
 */

/**
 * @typedef {Object} MatchResult
 * @property {"matched"|"ambiguous"|"unmatched"} status
 * @property {string}  [canonical_id]
 * @property {string}  [sleeper_id]
 * @property {string}  match_method
 * @property {number}  confidence
 * @property {string[]}flags
 * @property {Array}   [candidates]   — populated when ambiguous
 */

// ── Index builder ──────────────────────────────────────────────────────────

/**
 * Build lookup indexes from a Sleeper player pool for fast matching.
 * Called once per crosswalk build; results are reused for all NFLverse rows.
 *
 * @param {Object} sleeperPlayers  — raw dict from Sleeper /v1/players/nfl
 * @returns {{ byId, byNamePos, byTeamPos, dstByTeam }}
 */
export function buildSleeperIndexes(sleeperPlayers) {
  // Map: normalizedName+pos → [{ player_id, name, team, pos }]
  const byNamePos = {};
  // Map: team+pos → [player_id]
  const byTeamPos = {};
  // Map: teamAbbr → player_id (DST only)
  const dstByTeam = {};
  // Map: player_id → normalized record
  const byId      = {};

  Object.entries(sleeperPlayers).forEach(([pid, sp]) => {
    const pos = normalizePosition(sp.position);
    if (!pos) return; // IDP / non-fantasy — skip

    const team = normalizeTeam(sp.team || sp.fantasy_team);
    const name = sp.full_name || `${sp.first_name || ""} ${sp.last_name || ""}`.trim();

    const record = { player_id: pid, name, team, pos };
    byId[pid] = record;

    // DST index — key by team abbreviation
    if (pos === "DST" && team) {
      dstByTeam[team] = pid;
      return;
    }

    // Name+pos index
    const nameKeys = buildNameKeys(name);
    nameKeys.forEach(key => {
      const mapKey = `${key}:${pos}`;
      if (!byNamePos[mapKey]) byNamePos[mapKey] = [];
      byNamePos[mapKey].push(record);
    });

    // Team+pos index (for Tier 1 uniqueness check)
    if (team) {
      const tpKey = `${team}:${pos}`;
      if (!byTeamPos[tpKey]) byTeamPos[tpKey] = [];
      byTeamPos[tpKey].push(record);
    }
  });

  return { byId, byNamePos, byTeamPos, dstByTeam };
}

// ── Main matcher ───────────────────────────────────────────────────────────

/**
 * Resolve a single NFLverse record to a Sleeper canonical ID.
 *
 * @param {NFLverseRecord} nflRecord
 * @param {ReturnType<buildSleeperIndexes>} indexes
 * @param {Object} [knownIdBridges]  — e.g. { gsis_id: sleeper_id }
 * @returns {MatchResult}
 */
export function matchNFLverseRecord(nflRecord, indexes, knownIdBridges = {}) {
  const { byId, byNamePos, byTeamPos, dstByTeam } = indexes;

  const rawPos  = nflRecord.position;
  const pos     = normalizePosition(rawPos);
  const team    = normalizeTeam(nflRecord.team);
  const name    = nflRecord.display_name || nflRecord.full_name || "";
  const gsisId  = nflRecord.gsis_id;

  // Exclude non-fantasy positions early
  if (!pos) {
    return { status: "unmatched", match_method: "none", confidence: 0,
             flags: ["NON_FANTASY_POSITION"], reason: `position ${rawPos} excluded` };
  }

  // ── DST shortcut (confidence 1.0, deterministic) ────────────────────────
  if (pos === "DST") {
    const sleeperPid = team ? dstByTeam[team] : null;
    if (sleeperPid) {
      return {
        status:       "matched",
        canonical_id: buildCanonicalId("dst", team),
        sleeper_id:   sleeperPid,
        match_method: MATCH_METHOD.DST_ABBR,
        confidence:   METHOD_CONFIDENCE[MATCH_METHOD.DST_ABBR],
        flags:        [],
      };
    }
    return { status: "unmatched", match_method: MATCH_METHOD.DST_ABBR,
             confidence: 0, flags: ["DST_TEAM_NOT_FOUND"], reason: `team ${team}` };
  }

  // ── Tier 0: exact ID bridge ──────────────────────────────────────────────
  if (gsisId && knownIdBridges[gsisId]) {
    const pid = knownIdBridges[gsisId];
    if (byId[pid]) {
      return {
        status:       "matched",
        canonical_id: buildCanonicalId("skill", pid),
        sleeper_id:   pid,
        match_method: MATCH_METHOD.EXACT_ID,
        confidence:   METHOD_CONFIDENCE[MATCH_METHOD.EXACT_ID],
        flags:        [],
      };
    }
  }

  const nameKeys = buildNameKeys(name);

  // ── Tier 1: name + team + position (unique required) ────────────────────
  {
    const candidates = new Map(); // pid → record
    nameKeys.forEach(key => {
      const hits = byNamePos[`${key}:${pos}`] || [];
      hits.forEach(r => {
        if (normalizeTeam(r.team) === team) candidates.set(r.player_id, r);
      });
    });

    if (candidates.size === 1) {
      const [pid, rec] = [...candidates.entries()][0];
      return {
        status:       "matched",
        canonical_id: buildCanonicalId("skill", pid),
        sleeper_id:   pid,
        match_method: MATCH_METHOD.NAME_TEAM_POS,
        confidence:   METHOD_CONFIDENCE[MATCH_METHOD.NAME_TEAM_POS],
        flags:        [],
      };
    }
    if (candidates.size > 1) {
      return _ambiguous([...candidates.values()], MATCH_METHOD.NAME_TEAM_POS, name, pos, team);
    }
  }

  // ── Tier 2: name + position, team mismatch allowed ──────────────────────
  {
    const candidates = new Map();
    nameKeys.forEach(key => {
      const hits = byNamePos[`${key}:${pos}`] || [];
      hits.forEach(r => candidates.set(r.player_id, r));
    });

    if (candidates.size === 1) {
      const [pid, rec] = [...candidates.entries()][0];
      const teamMatch  = normalizeTeam(rec.team) === team;
      const conf       = METHOD_CONFIDENCE[MATCH_METHOD.NAME_POS] + (teamMatch ? 0.10 : 0);
      const flags      = teamMatch ? [] : ["TEAM_MISMATCH"];
      return {
        status:       "matched",
        canonical_id: buildCanonicalId("skill", pid),
        sleeper_id:   pid,
        match_method: MATCH_METHOD.NAME_POS,
        confidence:   Math.min(1.0, conf),
        flags,
      };
    }
    if (candidates.size > 1) {
      // Narrow by team before declaring ambiguous
      const teamMatches = [...candidates.values()].filter(r => normalizeTeam(r.team) === team);
      if (teamMatches.length === 1) {
        const pid = teamMatches[0].player_id;
        return {
          status:       "matched",
          canonical_id: buildCanonicalId("skill", pid),
          sleeper_id:   pid,
          match_method: MATCH_METHOD.NAME_POS,
          confidence:   METHOD_CONFIDENCE[MATCH_METHOD.NAME_POS],
          flags:        [],
        };
      }
      return _ambiguous([...candidates.values()], MATCH_METHOD.NAME_POS, name, pos, team);
    }
  }

  // ── Tier 3: fuzzy name + position ────────────────────────────────────────
  {
    // Score every Sleeper player at the same position
    const scored = [];
    Object.values(byId)
      .filter(r => r.pos === pos)
      .forEach(r => {
        const sim = nameSimilarity(name, r.name);
        if (sim >= 0.72) scored.push({ ...r, sim });
      });

    scored.sort((a, b) => b.sim - a.sim);

    const best = scored[0];
    if (!best) {
      return { status: "unmatched", match_method: "none", confidence: 0,
               flags: [], reason: `no candidate above threshold` };
    }

    // Require a clear winner — next candidate must be meaningfully worse
    const second = scored[1];
    const isUnique = !second || (best.sim - second.sim) >= 0.08;

    if (!isUnique) {
      return _ambiguous(scored.slice(0, 3), MATCH_METHOD.FUZZY, name, pos, team);
    }

    const conf = METHOD_CONFIDENCE[MATCH_METHOD.FUZZY] * best.sim;
    if (conf < CONFIDENCE.QUARANTINE) {
      return { status: "unmatched", match_method: MATCH_METHOD.FUZZY,
               confidence: conf, flags: ["CONFIDENCE_BELOW_THRESHOLD"] };
    }

    return {
      status:       "matched",
      canonical_id: buildCanonicalId("skill", best.player_id),
      sleeper_id:   best.player_id,
      match_method: MATCH_METHOD.FUZZY,
      confidence:   parseFloat(conf.toFixed(3)),
      flags:        conf < CONFIDENCE.AUTO_ACCEPT ? [FLAGS.LOW_CONFIDENCE] : [],
    };
  }
}

// ── Helper ─────────────────────────────────────────────────────────────────

function _ambiguous(candidates, method, name, pos, team) {
  return {
    status:       "ambiguous",
    match_method: method,
    confidence:   METHOD_CONFIDENCE[method] * 0.5, // degraded
    flags:        [FLAGS.AMBIGUOUS],
    candidates:   candidates.map(r => ({
      sleeper_id: r.player_id,
      name:       r.name,
      team:       r.team,
      pos:        r.pos,
      sim:        r.sim,
    })),
    input:        { name, pos, team },
  };
}
