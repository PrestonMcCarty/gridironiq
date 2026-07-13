/**
 * Vegas odds proxy — implied team totals
 * ======================================
 * GET /api/odds
 *
 * Fetches NFL game odds (spreads + totals) from The Odds API server-side and
 * derives each team's IMPLIED TEAM TOTAL — the single best market signal for
 * scoring environment. A high implied total (~28) means a good spot for that
 * team's skill players; a low one (~17) is a bad spot.
 *
 * The API key is read from process.env.ODDS_API_KEY and never leaves the
 * server. If it isn't configured the route returns { configured: false } so
 * the client degrades gracefully (same pattern as /api/yahoo).
 *
 * Get a free key at https://the-odds-api.com (free tier: 500 requests/month).
 * Add it as ODDS_API_KEY in Vercel env vars (Production + Preview) and in
 * gridiron-next/.env.local for local dev. Aggressively cached to conserve quota.
 */

import { NextResponse } from "next/server";

// Must run per-request (reads process.env + live odds), never prerendered.
export const dynamic = "force-dynamic";

const ODDS_URL =
  "https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds/" +
  "?regions=us&markets=spreads,totals&oddsFormat=american&apiKey=";

// The Odds API uses full team names; map to Sleeper abbreviations.
const TEAM_NAME_TO_ABBR = {
  "Arizona Cardinals": "ARI", "Atlanta Falcons": "ATL", "Baltimore Ravens": "BAL",
  "Buffalo Bills": "BUF", "Carolina Panthers": "CAR", "Chicago Bears": "CHI",
  "Cincinnati Bengals": "CIN", "Cleveland Browns": "CLE", "Dallas Cowboys": "DAL",
  "Denver Broncos": "DEN", "Detroit Lions": "DET", "Green Bay Packers": "GB",
  "Houston Texans": "HOU", "Indianapolis Colts": "IND", "Jacksonville Jaguars": "JAX",
  "Kansas City Chiefs": "KC", "Las Vegas Raiders": "LV", "Los Angeles Chargers": "LAC",
  "Los Angeles Rams": "LAR", "Miami Dolphins": "MIA", "Minnesota Vikings": "MIN",
  "New England Patriots": "NE", "New Orleans Saints": "NO", "New York Giants": "NYG",
  "New York Jets": "NYJ", "Philadelphia Eagles": "PHI", "Pittsburgh Steelers": "PIT",
  "San Francisco 49ers": "SF", "Seattle Seahawks": "SEA", "Tampa Bay Buccaneers": "TB",
  "Tennessee Titans": "TEN", "Washington Commanders": "WAS",
};

const CACHE = { data: null, exp: 0 };
const TTL_MS = 3 * 60 * 60_000; // 3 h — odds move slowly; conserve the 500/mo quota

export async function GET() {
  const key = process.env.ODDS_API_KEY;
  if (!key) {
    return NextResponse.json({ configured: false, teams: {} });
  }
  if (CACHE.data && Date.now() < CACHE.exp) {
    return NextResponse.json(CACHE.data, { headers: { "Cache-Control": "public, max-age=1800" } });
  }

  try {
    const r = await fetch(ODDS_URL + key);
    if (!r.ok) {
      const detail = (await r.text()).slice(0, 200);
      return NextResponse.json({ configured: true, error: `odds api HTTP ${r.status}`, detail, teams: {} }, { status: 502 });
    }
    const games = await r.json();
    const teams = {};

    for (const g of Array.isArray(games) ? games : []) {
      const home = TEAM_NAME_TO_ABBR[g.home_team];
      const away = TEAM_NAME_TO_ABBR[g.away_team];
      if (!home || !away) continue;

      // Average total and the home-team spread across all books for stability.
      let totalSum = 0, totalN = 0, homeSpreadSum = 0, spreadN = 0;
      for (const bk of g.bookmakers || []) {
        for (const m of bk.markets || []) {
          if (m.key === "totals" && m.outcomes?.[0]?.point != null) {
            totalSum += m.outcomes[0].point; totalN++;
          }
          if (m.key === "spreads") {
            const ho = m.outcomes?.find(o => o.name === g.home_team);
            if (ho?.point != null) { homeSpreadSum += ho.point; spreadN++; }
          }
        }
      }
      if (!totalN || !spreadN) continue;

      const total      = totalSum / totalN;
      const homeSpread  = homeSpreadSum / spreadN;
      // implied_team_total = total/2 - team_spread/2  (favorite's spread is negative)
      const homeImplied = total / 2 - homeSpread / 2;
      const awayImplied = total - homeImplied;

      teams[home] = { impliedTotal: +homeImplied.toFixed(1), total: +total.toFixed(1), spread: +homeSpread.toFixed(1), opponent: away, homeAway: "home", kickoff: g.commence_time };
      teams[away] = { impliedTotal: +awayImplied.toFixed(1), total: +total.toFixed(1), spread: +(-homeSpread).toFixed(1), opponent: home, homeAway: "away", kickoff: g.commence_time };
    }

    const data = { configured: true, count: Object.keys(teams).length, teams };
    CACHE.data = data; CACHE.exp = Date.now() + TTL_MS;
    return NextResponse.json(data, { headers: { "Cache-Control": "public, max-age=1800" } });
  } catch (e) {
    return NextResponse.json({ configured: true, error: e.message, teams: {} }, { status: 502 });
  }
}
