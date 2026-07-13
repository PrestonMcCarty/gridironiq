/**
 * NFLverse advanced-stats proxy
 * =============================
 * GET /api/nflverse?season=YYYY
 *
 * Fetches the public NFLverse player_stats + snap_counts CSVs SERVER-SIDE
 * (GitHub release assets don't send CORS headers, so the browser can't fetch
 * them directly), aggregates them to per-player season metrics, joins snap
 * share by name+team, and returns a compact JSON map keyed by normalized
 * name — a few KB instead of multi-MB CSVs.
 *
 * These are the "real opportunity" metrics FantasyPros-class tools rely on:
 *   wopr           Weighted Opportunity Rating (targets + air-yards blend)
 *   targetShare    share of team targets
 *   airYardsShare  share of team air yards
 *   snapPct        offensive snap share
 *   targets/carries season volume
 *
 * NFLverse data: https://github.com/nflverse/nflverse-data (MIT / open data)
 * No API key required.
 */

import { NextResponse } from "next/server";

const PLAYER_STATS = s => `https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats_${s}.csv`;
const SNAP_COUNTS  = s => `https://github.com/nflverse/nflverse-data/releases/download/snap_counts/snap_counts_${s}.csv`;

// ── Simple in-memory cache (persists across requests in a warm instance) ──
const CACHE = new Map(); // season → { data, exp }
const TTL_MS = 6 * 60 * 60_000; // 6 h — nflverse updates ~weekly

// ── Minimal CSV parser (handles quoted fields with embedded commas) ──────
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.length);
  if (lines.length < 2) return [];
  const parseLine = line => {
    const out = []; let cur = "", q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { q = !q; continue; }
      if (c === "," && !q) { out.push(cur); cur = ""; continue; }
      cur += c;
    }
    out.push(cur);
    return out;
  };
  const headers = parseLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseLine(lines[i]);
    const row = {};
    for (let j = 0; j < headers.length; j++) row[headers[j]] = vals[j];
    rows.push(row);
  }
  return rows;
}

const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const normLetters = s => (s || "").toLowerCase().replace(/[^a-z]/g, "");
const TEAM_ALIASES = { JAC: "JAX", ARZ: "ARI", CLV: "CLE", HST: "HOU", OAK: "LV", SL: "LAR", SD: "LAC", WSH: "WAS", WFT: "WAS", LA: "LAR" };
const normTeam = t => { const u = (t || "").toUpperCase().trim(); return TEAM_ALIASES[u] || u; };
// name+team → stable join key
const keyOf = (name, team) => `${normLetters(name)}|${normTeam(team)}`;

async function fetchCsv(url) {
  const r = await fetch(url, { headers: { "User-Agent": "GridironIQ/1.0" } });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return parseCSV(await r.text());
}

async function buildSeason(season) {
  // player_stats — required. snap_counts — best-effort.
  const statRows = await fetchCsv(PLAYER_STATS(season));
  let snapRows = [];
  try { snapRows = await fetchCsv(SNAP_COUNTS(season)); } catch (_) { /* snaps optional */ }

  // Aggregate offensive snap share per player (mean of weekly offense_pct).
  const snapAcc = {}; // key → { sum, n }
  for (const r of snapRows) {
    if ((r.game_type || "REG") !== "REG") continue;
    const pos = (r.position || "").toUpperCase();
    if (!["QB", "RB", "WR", "TE"].includes(pos)) continue;
    const k = keyOf(r.player, r.team);
    const pct = num(r.offense_pct); // 0..1
    if (!snapAcc[k]) snapAcc[k] = { sum: 0, n: 0 };
    snapAcc[k].sum += pct; snapAcc[k].n += 1;
  }

  // Aggregate player_stats — season volume sums + rate-metric means.
  const acc = {}; // key → aggregate
  for (const r of statRows) {
    if ((r.season_type || "REG") !== "REG") continue;
    const pos = (r.position || "").toUpperCase();
    if (!["QB", "RB", "WR", "TE"].includes(pos)) continue;
    const name = r.player_display_name || r.player_name || "";
    const team = r.recent_team || r.team || "";
    if (!name) continue;
    const k = keyOf(name, team);
    if (!acc[k]) acc[k] = { name, team: normTeam(team), pos, games: 0, targets: 0, carries: 0, tsSum: 0, aysSum: 0, woprSum: 0 };
    const a = acc[k];
    a.games   += 1;
    a.targets += num(r.targets);
    a.carries += num(r.carries);
    a.tsSum   += num(r.target_share);
    a.aysSum  += num(r.air_yards_share);
    a.woprSum += num(r.wopr);
  }

  // Finalize → compact per-player record.
  const players = {};
  for (const [k, a] of Object.entries(acc)) {
    const g = a.games || 1;
    const snap = snapAcc[k];
    players[k] = {
      name: a.name, team: a.team, pos: a.pos, games: a.games,
      targets:       Math.round(a.targets),
      carries:       Math.round(a.carries),
      targetShare:   +(a.tsSum  / g).toFixed(3),   // 0..1 mean
      airYardsShare: +(a.aysSum / g).toFixed(3),
      wopr:          +(a.woprSum / g).toFixed(3),
      snapPct:       snap ? +(snap.sum / snap.n).toFixed(3) : null, // 0..1 mean, or null
    };
  }
  return { season, count: Object.keys(players).length, players };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const reqSeason = parseInt(searchParams.get("season") || "", 10);
  const season = Number.isFinite(reqSeason) ? reqSeason : new Date().getFullYear() - 1;

  const cached = CACHE.get(season);
  if (cached && Date.now() < cached.exp) {
    return NextResponse.json(cached.data, { headers: { "Cache-Control": "public, max-age=3600" } });
  }

  try {
    let data;
    try {
      data = await buildSeason(season);
    } catch (e) {
      // Season CSV not published yet (e.g. offseason) → fall back one year.
      data = await buildSeason(season - 1);
    }
    CACHE.set(data.season, { data, exp: Date.now() + TTL_MS });
    return NextResponse.json(data, { headers: { "Cache-Control": "public, max-age=3600" } });
  } catch (e) {
    return NextResponse.json({ error: e.message, season, players: {} }, { status: 502 });
  }
}
