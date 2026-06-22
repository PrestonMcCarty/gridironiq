#!/usr/bin/env node
/**
 * scripts/build_historical_2024.mjs
 * ===================================
 * Node.js CLI build script for the 2024 historical artifact.
 * Runs outside the Next.js compiler — no @/ aliases, no browser APIs.
 *
 * Usage:
 *   node scripts/build_historical_2024.mjs
 *   node scripts/build_historical_2024.mjs --force-refresh   # bypass CSV cache
 *   node scripts/build_historical_2024.mjs --dry-run         # validate only, no output
 *
 * Output:
 *   public/data/historical_2024.json
 *   scripts/cache/nflverse_2024.csv   (local CSV cache)
 *   scripts/cache/nflverse_2024.sha256
 *
 * Exit codes:
 *   0  success
 *   1  validation failed
 *   2  network error (all retries exhausted)
 *   3  column validation failed
 *   4  unexpected error
 */

import fs   from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

// ── Path resolution ────────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, "..");
const SRC       = path.join(ROOT, "src", "lib");

// Dynamic imports using file:// URLs (required for Windows — C:\ paths break ESM loader)
const { normalizePosition, normalizeTeam } =
  await import(pathToFileURL(path.join(SRC, "identity", "nameNormalizer.js")));
const { buildCanonicalId, NFL_TEAMS, CANONICAL_POSITIONS, POS_EQUIV } =
  await import(pathToFileURL(path.join(SRC, "identity", "crosswalkSchema.js")));
const { buildSleeperIndexes, matchNFLverseRecord } =
  await import(pathToFileURL(path.join(SRC, "identity", "crosswalkMatcher.js")));
const { buildCrosswalk } =
  await import(pathToFileURL(path.join(SRC, "identity", "crosswalkBuilder.js")));
const {
  aggregateSeasonStats, computeSeasonScores, computeFinishes,
  SCORING_ENGINE_VERSION,
} = await import(pathToFileURL(path.join(SRC, "historical", "historicalScorer.js")));
const { validateArtifact } =
  await import(pathToFileURL(path.join(SRC, "historical", "artifactValidator.js")));

// ── Configuration ──────────────────────────────────────────────────────────
const SEASON        = 2024;
const NFLVERSE_URL  = "https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats_2024.csv";
const SLEEPER_URL   = "https://api.sleeper.app/v1/players/nfl";
const CACHE_DIR     = path.join(__dirname, "cache");
const CSV_CACHE     = path.join(CACHE_DIR, `nflverse_${SEASON}.csv`);
const SHA_CACHE     = path.join(CACHE_DIR, `nflverse_${SEASON}.sha256`);
const OUTPUT_DIR    = path.join(ROOT, "public", "data");
const OUTPUT_FILE   = path.join(OUTPUT_DIR, `historical_${SEASON}.json`);

const RETRY_ATTEMPTS    = 3;
const RETRY_BASE_MS     = 1_000;    // 1s → 3s → 9s

// Scoring-critical columns — build FAILS if any are missing from the CSV
const CRITICAL_COLUMNS = [
  "passing_yards", "passing_tds", "interceptions",
  "rushing_yards", "rushing_tds",
  "receptions",    "receiving_yards", "receiving_tds",
  "recent_team",   "position",       "season_type",
  "player_id",     "player_display_name",
];

// Scoring-optional columns — WARNING if missing, but build continues
const OPTIONAL_COLUMNS = [
  "fg_made_0_19","fg_made_20_29","fg_made_30_39","fg_made_40_49","fg_made_50_",
  "pat_made","def_sacks","def_interceptions","def_tds","special_teams_tds",
  "rushing_fumbles_lost","receiving_fumbles_lost",
];

// Known GSIS→Sleeper ID bridges — add entries from crosswalk quarantine report
const KNOWN_ID_BRIDGES = {};
const MANUAL_OVERRIDES = {};

// ── CLI flags ──────────────────────────────────────────────────────────────
const args         = process.argv.slice(2);
const FORCE_REFRESH = args.includes("--force-refresh");
const DRY_RUN       = args.includes("--dry-run");

// ── Logging ────────────────────────────────────────────────────────────────
const log = {
  info:  (...a) => console.log("\x1b[36m[INFO]\x1b[0m",  ...a),
  ok:    (...a) => console.log("\x1b[32m[ OK ]\x1b[0m",  ...a),
  warn:  (...a) => console.log("\x1b[33m[WARN]\x1b[0m",  ...a),
  error: (...a) => console.error("\x1b[31m[ERR ]\x1b[0m", ...a),
  step:  (n, t) => console.log(`\n\x1b[1m── Step ${n}: ${t}\x1b[0m`),
};

// ── Retry with exponential backoff ─────────────────────────────────────────
async function fetchWithRetry(url, label, attempt = 1) {
  log.info(`${label} — attempt ${attempt}/${RETRY_ATTEMPTS}  ${url}`);
  try {
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 30_000); // 30s timeout
    const resp       = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
    return resp;
  } catch (err) {
    const isLast = attempt >= RETRY_ATTEMPTS;
    const label2 = err.name === "AbortError" ? "timeout after 30s" : err.message;
    log.warn(`  ✗ Attempt ${attempt} failed: ${label2}`);
    if (isLast) throw new Error(`All ${RETRY_ATTEMPTS} attempts exhausted for ${label}: ${err.message}`);
    const delayMs = RETRY_BASE_MS * Math.pow(3, attempt - 1);
    log.info(`  Retrying in ${delayMs / 1000}s...`);
    await new Promise(r => setTimeout(r, delayMs));
    return fetchWithRetry(url, label, attempt + 1);
  }
}

// ── SHA-256 helpers ────────────────────────────────────────────────────────
function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function readCachedSha() {
  try { return fs.readFileSync(SHA_CACHE, "utf8").trim(); } catch { return null; }
}

// ── CSV parsing (no browser cache — uses Node fs directly) ─────────────────
function parseCSVNode(text) {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
  const rows = lines.slice(1).map(line => {
    const vals = [];
    let cur = "", inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === "," && !inQ) { vals.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    vals.push(cur.trim());
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] ?? ""; });
    return obj;
  });
  return { headers, rows };
}

// ── Column validation ──────────────────────────────────────────────────────
function validateColumns(headers) {
  const missing  = CRITICAL_COLUMNS.filter(c => !headers.includes(c));
  const optional = OPTIONAL_COLUMNS.filter(c => !headers.includes(c));

  if (optional.length) {
    log.warn(`Optional columns absent (scoring will use fallbacks): ${optional.join(", ")}`);
  }
  if (missing.length) {
    log.error("CRITICAL columns missing from NFLverse CSV:");
    missing.forEach(c => log.error(`  ✗  ${c}`));
    log.error("NFLverse may have changed their column schema. Update COL_MAP before proceeding.");
    process.exit(3);
  }
  log.ok(`Column validation passed — all ${CRITICAL_COLUMNS.length} critical columns present`);
}

// ── NFLverse CSV fetch with disk cache ────────────────────────────────────
async function getNFLverseCSV() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });

  // Use disk cache unless --force-refresh
  if (!FORCE_REFRESH && fs.existsSync(CSV_CACHE)) {
    const cached   = fs.readFileSync(CSV_CACHE, "utf8");
    const cachedSha = readCachedSha();
    const actualSha = sha256(cached);
    if (cachedSha && cachedSha !== actualSha) {
      log.warn("Cache SHA mismatch — cache may be corrupt. Re-downloading.");
    } else {
      log.ok(`Using cached CSV: ${CSV_CACHE} (${(cached.length / 1024).toFixed(0)}KB)`);
      if (cachedSha) log.info(`  SHA-256: ${cachedSha}`);
      return cached;
    }
  }

  if (FORCE_REFRESH) log.info("--force-refresh: bypassing CSV cache");

  const resp = await fetchWithRetry(NFLVERSE_URL, "NFLverse CSV");
  const text = await resp.text();
  const hash = sha256(text);

  log.ok(`Downloaded ${(text.length / 1024).toFixed(0)}KB  SHA-256: ${hash}`);

  // Write to disk cache
  fs.writeFileSync(CSV_CACHE, text,  "utf8");
  fs.writeFileSync(SHA_CACHE, hash,  "utf8");
  log.info(`Cached to: ${CSV_CACHE}`);

  return text;
}

// ── Sleeper player fetch ───────────────────────────────────────────────────
async function getSleeperPlayers() {
  const resp  = await fetchWithRetry(SLEEPER_URL, "Sleeper /players/nfl");
  return resp.json();
}

// ── NFLverse row normalization (Node-side, mirrors nflverseIngestion.js) ───
const COL_MAP = {
  player_id: "gsis_id", player_display_name: "display_name",
  player_name: "player_name", recent_team: "team", position: "position",
  season: "season", week: "week", season_type: "season_type",
  completions: "completions", attempts: "attempts",
  passing_yards: "pass_yd", passing_tds: "pass_td", interceptions: "pass_int",
  sacks: "sack_taken", passing_2pt_conversions: "pass_2pt",
  carries: "carries", rushing_yards: "rush_yd", rushing_tds: "rush_td",
  rushing_fumbles_lost: "fum_lost", rushing_2pt_conversions: "rush_2pt",
  receptions: "rec", targets: "targets",
  receiving_yards: "rec_yd", receiving_tds: "rec_td",
  receiving_fumbles_lost: "rec_fum_lost", receiving_2pt_conversions: "rec_2pt",
  fg_made: "fgm", fg_made_0_19: "fgm_0_19", fg_made_20_29: "fgm_20_29",
  fg_made_30_39: "fgm_30_39", fg_made_40_49: "fgm_40_49", fg_made_50_: "fgm_50p",
  fg_att: "fga", pat_made: "xpm", pat_att: "xpa",
  def_tackles_for_loss: "tkl_loss", def_sacks: "sack", def_interceptions: "int",
  def_fumble_recovery_own: "fum_rec_own", def_fumble_recovery_opp: "fum_rec",
  def_safety: "safe", def_tds: "def_td", special_teams_tds: "def_st_td",
};

function normalizeRows(rawRows, season) {
  const out = [];
  let skippedSeason = 0, skippedPos = 0, skippedEmpty = 0;

  rawRows.forEach(raw => {
    const seasonType = raw.season_type || raw.game_type || "REG";
    if (seasonType !== "REG") { skippedSeason++; return; }
    const rawPos = raw.position || raw.pos || "";
    const pos    = normalizePosition(rawPos);
    if (!pos) { skippedPos++; return; }
    const row = {
      gsis_id:      raw.player_id || raw.gsis_id || null,
      display_name: raw.player_display_name || raw.player_name || raw.name || "",
      position: rawPos, pos,
      team:   normalizeTeam(raw.recent_team || raw.team || ""),
      season: parseInt(raw.season || season, 10),
      week:   parseInt(raw.week || 0, 10),
    };
    Object.entries(COL_MAP).forEach(([nflCol, intCol]) => {
      if (raw[nflCol] !== undefined && raw[nflCol] !== "") {
        const val = parseFloat(raw[nflCol]);
        if (!isNaN(val)) row[intCol] = val;
      }
    });
    row.fum_lost = (row.fum_lost || 0) + (row.rec_fum_lost || 0);
    delete row.rec_fum_lost;
    if (!hasActivity(row, pos)) { skippedEmpty++; return; }
    out.push(row);
  });

  log.info(
    `Normalized ${out.length} rows ` +
    `(skipped: ${skippedSeason} non-REG, ${skippedPos} non-fantasy pos, ${skippedEmpty} empty)`
  );
  return out;
}

function hasActivity(row, pos) {
  if (pos === "DST") {
    // NFLverse player_stats doesn't include DST rows — seeded from Sleeper below
    return (row.sack||0)+(row.int||0)+(row.def_td||0)+(row.fum_rec||0)+(row.safe||0) > 0
        || row.pts_allow !== undefined;
  }
  if (pos === "K") {
    // Accept any kicker activity — distance buckets optional, raw fgm/xpm sufficient
    return (row.fgm||0)+(row.fgm_0_19||0)+(row.fgm_20_29||0)+
           (row.fgm_30_39||0)+(row.fgm_40_49||0)+(row.fgm_50p||0)+
           (row.xpm||0)+(row.fga||0)+(row.xpa||0) > 0;
  }
  return (row.attempts||0)+(row.carries||0)+(row.targets||0)+
         (row.rec||0)+(row.pass_yd||0)+(row.rush_yd||0)+(row.rec_yd||0) > 0;
}

function groupByPlayer(rows) {
  const groups = {};
  rows.forEach(row => {
    const id = row.gsis_id || `anon:${row.display_name}:${row.team}`;
    if (!groups[id]) groups[id] = [];
    groups[id].push(row);
  });
  return groups;
}

// ── DST canonical names ────────────────────────────────────────────────────
const DST_NAMES = {
  ARI:"Arizona Cardinals D/ST",ATL:"Atlanta Falcons D/ST",BAL:"Baltimore Ravens D/ST",
  BUF:"Buffalo Bills D/ST",CAR:"Carolina Panthers D/ST",CHI:"Chicago Bears D/ST",
  CIN:"Cincinnati Bengals D/ST",CLE:"Cleveland Browns D/ST",DAL:"Dallas Cowboys D/ST",
  DEN:"Denver Broncos D/ST",DET:"Detroit Lions D/ST",GB:"Green Bay Packers D/ST",
  HOU:"Houston Texans D/ST",IND:"Indianapolis Colts D/ST",JAX:"Jacksonville Jaguars D/ST",
  KC:"Kansas City Chiefs D/ST",LAC:"Los Angeles Chargers D/ST",LAR:"Los Angeles Rams D/ST",
  LV:"Las Vegas Raiders D/ST",MIA:"Miami Dolphins D/ST",MIN:"Minnesota Vikings D/ST",
  NE:"New England Patriots D/ST",NO:"New Orleans Saints D/ST",NYG:"New York Giants D/ST",
  NYJ:"New York Jets D/ST",PHI:"Philadelphia Eagles D/ST",PIT:"Pittsburgh Steelers D/ST",
  SEA:"Seattle Seahawks D/ST",SF:"San Francisco 49ers D/ST",TB:"Tampa Bay Buccaneers D/ST",
  TEN:"Tennessee Titans D/ST",WAS:"Washington Commanders D/ST",
};

// ── Main build ─────────────────────────────────────────────────────────────
async function main() {
  const startMs = Date.now();
  log.info(`GridironIQ — Historical ${SEASON} Artifact Build`);
  log.info(`Mode: ${DRY_RUN ? "DRY RUN (no output)" : "FULL BUILD"}`);
  log.info(`Force refresh: ${FORCE_REFRESH}`);

  // ── Step 1: Fetch NFLverse CSV (with cache) ──────────────────────────────
  log.step(1, "Fetch NFLverse CSV");
  const csvText = await getNFLverseCSV();

  // ── Step 2: Column validation ────────────────────────────────────────────
  log.step(2, "Column validation");
  const { headers, rows: rawRows } = parseCSVNode(csvText);
  log.info(`CSV headers (${headers.length}): ${headers.slice(0, 8).join(", ")} ...`);
  validateColumns(headers);  // exits process with code 3 if critical columns missing

  // ── Step 3: Normalize rows ───────────────────────────────────────────────
  log.step(3, "Normalize rows");
  const statRows = normalizeRows(rawRows, SEASON);
  const grouped  = groupByPlayer(statRows);
  log.ok(`${statRows.length} usable rows across ${Object.keys(grouped).length} players`);

  // ── Step 4: Load Sleeper player pool ─────────────────────────────────────
  log.step(4, "Fetch Sleeper player pool (identity anchor)");
  const sleeperPlayers = await getSleeperPlayers();
  log.ok(`${Object.keys(sleeperPlayers).length} Sleeper players loaded`);

  // ── Step 5: Build crosswalk ───────────────────────────────────────────────
  log.step(5, "Build crosswalk indexes");
  const crosswalkResult = buildCrosswalk(sleeperPlayers, {
    knownIdBridges:  KNOWN_ID_BRIDGES,
    manualOverrides: MANUAL_OVERRIDES,
  });
  const indexes = buildSleeperIndexes(sleeperPlayers);
  log.ok(`Crosswalk: ${Object.keys(crosswalkResult.crosswalk).length} entries`);

  // ── Step 6: Match, aggregate, score ──────────────────────────────────────
  log.step(6, "Match players, aggregate stats, compute scores");
  const records     = [];
  const quarantine  = [];
  const unmatchedLog= [];
  const matchReport = { matched: 0, ambiguous: 0, unmatched: 0, dstAuto: 0 };
  const dstSeen     = new Set();

  Object.entries(grouped).forEach(([gsisId, rows]) => {
    const sample = rows[0];
    const pos    = normalizePosition(sample.position);
    const team   = normalizeTeam(sample.team);
    const name   = sample.display_name || sample.player_name || "";
    if (!pos) return;

    if (pos === "DST") {
      if (!team) return;
      dstSeen.add(team);
      const canonId = buildCanonicalId("dst", team);
      const { stat_totals, games_played, games_active } = aggregateSeasonStats(rows, "DST");
      const scores = computeSeasonScores(stat_totals, games_played, "DST");
      records.push({
        canonical_id: canonId,
        nflverse_id:  gsisId.startsWith("anon:") ? null : gsisId,
        season: SEASON, position: "DST", team,
        name: DST_NAMES[team] || `${team} D/ST`,
        stat_totals, games_played, games_active, ...scores,
        overall_finish: null, position_finish: null,
        record_type: "actual", finalized: true,
        provenance: { source: "nflverse", fetchedAt: BUILD_TS, scoringEngine: SCORING_ENGINE_VERSION, artifactVersion: `${SEASON}.1` },
      });
      matchReport.dstAuto++;
      return;
    }

    const nflRecord = {
      gsis_id:      gsisId.startsWith("anon:") ? null : gsisId,
      display_name: name, position: sample.position, team: sample.team, season: SEASON,
    };

    if (MANUAL_OVERRIDES[nflRecord.gsis_id]) {
      const pid     = MANUAL_OVERRIDES[nflRecord.gsis_id];
      const canonId = buildCanonicalId("skill", pid);
      const sp      = sleeperPlayers[pid];
      const { stat_totals, games_played, games_active } = aggregateSeasonStats(rows, pos);
      const scores = computeSeasonScores(stat_totals, games_played, pos);
      records.push(makeRecord(canonId, pid, nflRecord.gsis_id, sp?.full_name || name, pos, team, stat_totals, games_played, games_active, scores, "manual", 1.0));
      matchReport.matched++;
      return;
    }

    const result = matchNFLverseRecord(nflRecord, indexes, KNOWN_ID_BRIDGES);

    if (result.status === "matched") {
      matchReport.matched++;
      const sp = sleeperPlayers[result.sleeper_id];
      const { stat_totals, games_played, games_active } = aggregateSeasonStats(rows, pos);
      const scores = computeSeasonScores(stat_totals, games_played, pos);
      records.push(makeRecord(result.canonical_id, result.sleeper_id, nflRecord.gsis_id, sp?.full_name || name, pos, team, stat_totals, games_played, games_active, scores, result.match_method, result.confidence));
    } else if (result.status === "ambiguous") {
      matchReport.ambiguous++;
      quarantine.push({ gsisId, name, pos, team, candidates: result.candidates });
    } else {
      matchReport.unmatched++;
      unmatchedLog.push({ gsisId, name, pos, team });
    }
  });

  // Seed missing DST teams — NFLverse player_stats never contains DST rows
  // so all 32 are always seeded here with zero stats
  NFL_TEAMS.forEach(abbr => {
    if (dstSeen.has(abbr)) return;
    const canonId = buildCanonicalId("dst", abbr);
    records.push({
      canonical_id: canonId, nflverse_id: null, season: SEASON,
      position: "DST", team: abbr, name: DST_NAMES[abbr] || `${abbr} D/ST`,
      stat_totals: {}, games_played: 0, games_active: 0,
      fantasy_points_ppr: 0, fantasy_points_half: 0, fantasy_points_std: 0,
      ppg_ppr: 0, ppg_half: 0, ppg_std: 0,
      overall_finish: null, position_finish: null,
      record_type: "actual", finalized: true,
      provenance: { source: "nflverse", fetchedAt: BUILD_TS, scoringEngine: SCORING_ENGINE_VERSION, artifactVersion: `${SEASON}.1`, notes: "dst_seeded_from_sleeper" },
    });
    matchReport.dstAuto++;
  });

  // Seed kickers — NFLverse player_stats may not include kicker FG columns
  // depending on version. Build kicker records from matched stat rows if present,
  // otherwise seed active kickers from the Sleeper pool with zero stats.
  const kickersSeen = new Set(records.filter(r => r.position === "K").map(r => r.canonical_id));
  Object.entries(sleeperPlayers).forEach(([pid, sp]) => {
    if (sp.position !== "K") return;
    if (!sp.team || sp.team === "FA") return;  // skip free agents
    const canonId = buildCanonicalId("skill", pid);
    if (kickersSeen.has(canonId)) return;       // already added from stat rows
    records.push({
      canonical_id: canonId, nflverse_id: null, sleeper_id: pid, season: SEASON,
      position: "K", team: normalizeTeam(sp.team),
      name: sp.full_name || `${sp.first_name || ""} ${sp.last_name || ""}`.trim(),
      stat_totals: {}, games_played: 0, games_active: 0,
      fantasy_points_ppr: 0, fantasy_points_half: 0, fantasy_points_std: 0,
      ppg_ppr: 0, ppg_half: 0, ppg_std: 0,
      overall_finish: null, position_finish: null,
      record_type: "actual", finalized: true,
      provenance: { source: "sleeper", fetchedAt: BUILD_TS, scoringEngine: SCORING_ENGINE_VERSION, artifactVersion: `${SEASON}.1`, notes: "k_seeded_no_nflverse_stats" },
    });
  });

  log.ok(`Matched: ${matchReport.matched} | DST auto: ${matchReport.dstAuto} | Ambiguous: ${matchReport.ambiguous} | Unmatched: ${matchReport.unmatched}`);
  if (quarantine.length) {
    log.warn(`${quarantine.length} ambiguous — add to KNOWN_ID_BRIDGES to resolve:`);
    quarantine.slice(0, 10).forEach(q =>
      log.warn(`  ${q.name} (${q.pos}/${q.team}) → candidates: ${q.candidates?.map(c => c.name).join(" | ")}`)
    );
  }

  // ── Step 7: Compute finishes ──────────────────────────────────────────────
  log.step(7, "Compute finishes");
  computeFinishes(records, "PPR");
  log.ok(`Finishes computed for ${records.length} records`);

  // ── Step 8: Validate ──────────────────────────────────────────────────────
  log.step(8, "Run validation suite");
  const validation = validateArtifact(records, SEASON);

  if (validation.errors.length) {
    log.error(`Validation FAILED — ${validation.errors.length} error(s):`);
    validation.errors.forEach(e => log.error(`  ✗  ${e}`));
  }
  if (validation.warnings.length) {
    validation.warnings.forEach(w => log.warn(`  ⚠  ${w}`));
  }
  if (!validation.passed) {
    log.error("Artifact NOT written. Fix errors and rebuild.");
    process.exit(1);
  }
  log.ok("Validation passed");

  // ── Step 9: Write artifact ────────────────────────────────────────────────
  log.step(9, "Write artifact");
  const artifact = {
    _meta: {
      season: SEASON,
      record_type: "actual",
      finalized: true,
      built_at: new Date(BUILD_TS).toISOString(),
      artifact_version: `${SEASON}.1`,
      scoring_engine:   SCORING_ENGINE_VERSION,
      total_records:    records.length,
      build_ms:         Date.now() - startMs,
      match_report:     matchReport,
      quarantine_count: quarantine.length,
      unmatched_count:  matchReport.unmatched,
      csv_sha256:       sha256(csvText),
    },
    players: Object.fromEntries(
      [...records]
        .sort((a, b) => (a.overall_finish || 9999) - (b.overall_finish || 9999))
        .map(r => [r.canonical_id, r])
    ),
  };

  if (DRY_RUN) {
    log.ok(`DRY RUN — artifact not written (${records.length} records, ${validation.warnings.length} warnings)`);
  } else {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(artifact, null, 2), "utf8");
    const sizeKB = (fs.statSync(OUTPUT_FILE).size / 1024).toFixed(0);
    log.ok(`Written: ${OUTPUT_FILE}  (${sizeKB}KB)`);
    log.ok(`CSV SHA-256 in artifact: ${artifact._meta.csv_sha256}`);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
  log.info(`\n✓ Build complete in ${elapsed}s — ${records.length} records`);
  log.info(`  By position: ${CANONICAL_POSITIONS.map(p => `${p}:${records.filter(r=>r.position===p).length}`).join("  ")}`);

  // Top 10 PPR (spot-check)
  const top10 = records
    .filter(r => r.games_played > 0)
    .sort((a, b) => a.overall_finish - b.overall_finish)
    .slice(0, 10);
  log.info("\n  Top 10 PPR:");
  top10.forEach(r =>
    log.info(`    #${String(r.overall_finish).padStart(2)} ${r.position}${String(r.position_finish).padStart(2)}  ${r.name.padEnd(22)} ${String(r.fantasy_points_ppr).padStart(7)}pts  ${r.ppg_ppr}ppg`)
  );
}

// ── Shared record factory ──────────────────────────────────────────────────
const BUILD_TS = Date.now();
function makeRecord(canonId, sleeperPid, gsisId, name, pos, team, stat_totals, games_played, games_active, scores, method, confidence) {
  return {
    canonical_id: canonId, sleeper_id: sleeperPid,
    nflverse_id:  gsisId || null,
    season: SEASON, position: pos, team, name,
    stat_totals, games_played, games_active, ...scores,
    overall_finish: null, position_finish: null,
    record_type: "actual", finalized: true,
    match_method: method, match_confidence: confidence,
    provenance: {
      source: "nflverse", fetchedAt: BUILD_TS,
      scoringEngine: SCORING_ENGINE_VERSION,
      artifactVersion: `${SEASON}.1`,
      matchMethod: method, matchConfidence: confidence,
    },
  };
}

// ── Entry point ────────────────────────────────────────────────────────────
main().catch(err => {
  log.error("Unexpected error:", err.message);
  if (process.env.DEBUG) console.error(err);
  process.exit(4);
});
