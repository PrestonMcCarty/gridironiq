import { CURRENT_WEEK } from "@/lib/constants";

export const LeagueTendenciesEngine = {
  buildAllProfiles(users, rosters, transactions, matchupHistory, players) {
    const profiles = {};
    const userMap  = {};
    users.forEach(u => { userMap[u.user_id] = u; });
    rosters.forEach(roster => {
      const user    = userMap[roster.owner_id] || {};
      const profile = this.buildProfile(
        { ...user, roster_id: roster.roster_id },
        roster, transactions, matchupHistory, players, rosters,
      );
      profiles[roster.roster_id] = profile;
    });
    return profiles;
  },

  buildProfile(user, roster, transactions, matchupHistory, players, allRosters) {
    const userId   = user.user_id;
    const rosterId = roster.roster_id;

    const myTrades  = transactions.filter(t => t.type === "trade" && (t.roster_ids || []).map(String).includes(String(rosterId)));
    const myWaivers = transactions.filter(t => (t.type === "waiver" || t.type === "free_agent") && (t.roster_ids || []).map(String).includes(String(rosterId)));
    const tradeFreq  = myTrades.length;
    const tradeFreqLabel = tradeFreq >= 5 ? "Heavy Trader" : tradeFreq >= 2 ? "Occasional Trader" : "Reluctant to Trade";

    const posCount = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 };
    let totalTradedIn = 0;
    myTrades.forEach(t => {
      Object.entries(t.adds || {}).forEach(([pid, rid]) => {
        if (String(rid) !== String(rosterId)) return;
        const p = players.find(x => String(x.sleeperPlayerId) === String(pid) || String(x.id) === String(pid));
        if (p && posCount[p.pos] !== undefined) { posCount[p.pos]++; totalTradedIn++; }
      });
    });
    const posPreferences = {};
    Object.entries(posCount).forEach(([pos, cnt]) => {
      posPreferences[pos] = totalTradedIn > 0 ? Math.round((cnt / totalTradedIn) * 100) : 25;
    });

    const waiverPerWeek = CURRENT_WEEK > 0 ? myWaivers.length / CURRENT_WEEK : 0;
    const waiverLabel   = waiverPerWeek >= 2 ? "Aggressive Waiver User" : waiverPerWeek >= 0.8 ? "Moderate Waiver Activity" : "Passive on Waivers";

    const wins       = roster.settings?.wins   || 0;
    const losses     = roster.settings?.losses || 0;
    const pf         = roster.settings?.fpts   || 0;
    const pa         = roster.settings?.fpts_against || 0;
    const totalGames = wins + losses;
    const winPct     = totalGames > 0 ? wins / totalGames : 0.5;
    const winNowBias = Math.min(100, Math.max(0, Math.round(winPct * 100 + (wins >= 7 ? 15 : losses >= 7 ? -20 : 0))));

    const sortedRosters    = [...allRosters].sort((a,b) => (b.settings?.wins||0) - (a.settings?.wins||0));
    const myRank           = sortedRosters.findIndex(r => r.roster_id === rosterId);
    const playoffSpots     = Math.floor(allRosters.length / 3);
    const playoffContention = myRank < playoffSpots * 2;

    const rosterPlayerIds = roster.players || [];
    const rosterPlayers   = rosterPlayerIds.map(pid =>
      players.find(p => String(p.sleeperPlayerId) === String(pid) || String(p.id) === String(pid))
    ).filter(Boolean);
    const posPPG = pos => {
      const pp = rosterPlayers.filter(p => p.pos === pos && p.injury !== "IR" && p.injury !== "OUT");
      return pp.length ? pp.reduce((s, p) => s + p.ppg, 0) / pp.length : 0;
    };
    const rosterStrength = {
      QB:  posPPG("QB"),
      RB:  posPPG("RB"),
      WR:  posPPG("WR"),
      TE:  posPPG("TE"),
      K:   posPPG("K"),
      DST: posPPG("DST"),
    };
    const gradePos = (pos, avg) => {
      const thresh = { QB: 24, RB: 17, WR: 15, TE: 10, K: 7, DST: 7 }[pos] || 12;
      return avg >= thresh * 1.25 ? "A" : avg >= thresh ? "B" : avg >= thresh * 0.75 ? "C" : "D";
    };
    const rosterGrades = {};
    Object.entries(rosterStrength).forEach(([pos, avg]) => { rosterGrades[pos] = gradePos(pos, avg); });
    const weakPositions = Object.entries(rosterGrades).filter(([,g]) => g === "C" || g === "D").map(([pos]) => pos);

    const depth = {};
    ["QB","RB","WR","TE","K","DST"].forEach(pos => {
      depth[pos] = rosterPlayers.filter(p => p.pos === pos && p.injury !== "IR").length;
    });

    const riskTolerance = Math.min(100, Math.round(
      (tradeFreq >= 4 ? 30 : tradeFreq >= 2 ? 20 : 10) +
      (waiverPerWeek >= 2 ? 25 : waiverPerWeek >= 1 ? 15 : 5) +
      winNowBias * 0.3 + (weakPositions.length * 5)
    ));

    const acceptanceBaserate = Math.min(85, Math.max(20, Math.round(
      30 +
      (tradeFreq >= 5 ? 25 : tradeFreq >= 3 ? 15 : tradeFreq >= 1 ? 8 : 0) +
      (winNowBias >= 70 ? 15 : winNowBias >= 50 ? 8 : 0) +
      (weakPositions.length >= 2 ? 12 : weakPositions.length >= 1 ? 6 : 0) +
      (waiverPerWeek >= 2 ? 8 : 0)
    )));

    return {
      userId, rosterId,
      displayName: user.display_name || user.metadata?.team_name || `Team ${rosterId}`,
      teamName:    user.metadata?.team_name || `Team ${rosterId}`,
      tradeFreq, tradeFreqLabel, posPreferences,
      rookiePref: 30,
      riskTolerance,
      waiverActivity: parseFloat(waiverPerWeek.toFixed(2)),
      waiverLabel,
      winNowBias, acceptanceBaserate,
      record: { wins, losses, pf: Math.round(pf), pa: Math.round(pa) },
      playoffContention, rosterStrength, rosterGrades, weakPositions, depth,
      rosterPlayers: rosterPlayerIds,
      rank: myRank + 1,
      totalTeams: allRosters.length,
    };
  },
};
