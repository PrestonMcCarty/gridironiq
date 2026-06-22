export const TradeFinderEngine = {
  suggest(myProfile, allProfiles, players, settings, maxSuggestions = 8) {
    if (!myProfile || !allProfiles.length || !players.length) return [];
    // K and DST are valid trade assets — include them even with 0 PPG (pre-season / bye week)
    const myPlayers = (myProfile.rosterPlayers || [])
      .map(pid => players.find(p => String(p.sleeperPlayerId) === String(pid) || String(p.id) === String(pid)))
      .filter(Boolean);
    const proposals = [];
    allProfiles.forEach(theirProfile => {
      if (theirProfile.rosterId === myProfile.rosterId) return;
      const theirPlayers = (theirProfile.rosterPlayers || [])
        .map(pid => players.find(p => String(p.sleeperPlayerId) === String(pid) || String(p.id) === String(pid)))
        .filter(Boolean);
      const candidates = this._generateCandidates(myPlayers, theirPlayers, myProfile, theirProfile, settings);
      candidates.forEach(pkg => {
        const proposal = this._scoreProposal(pkg, myProfile, theirProfile, players, settings);
        if (proposal.fairnessScore >= 30 && proposal.acceptanceProbability >= 20) proposals.push(proposal);
      });
    });
    proposals.sort((a, b) => {
      const sA = a.fairnessScore * 0.35 + a.acceptanceProbability * 0.4 + (a.championshipOddsImpact + 30) * 0.25;
      const sB = b.fairnessScore * 0.35 + b.acceptanceProbability * 0.4 + (b.championshipOddsImpact + 30) * 0.25;
      return sB - sA;
    });
    return proposals.slice(0, maxSuggestions);
  },

  _generateCandidates(myPlayers, theirPlayers, myProfile, theirProfile, settings) {
    const candidates = [];
    const POSITIONS = ["QB","RB","WR","TE"];
    POSITIONS.forEach(myNeedPos => {
      if (!["C","D"].includes(myProfile.rosterGrades[myNeedPos] || "B")) return;
      const theirTargets = theirPlayers
        // K and DST may have ppg=0 early-season or on bye — include them as valid assets
        .filter(p => p.pos === myNeedPos && !["OUT","IR"].includes(p.injury))
        .sort((a, b) => (b.fcValue || b.ppg * 100) - (a.fcValue || a.ppg * 100))
        .slice(0, 3);
      if (!theirTargets.length) return;
      POSITIONS.forEach(theirNeedPos => {
        if (!["C","D"].includes(theirProfile.rosterGrades[theirNeedPos] || "B")) return;
        const myAvailable = myPlayers
          // K and DST may have ppg=0 — include as valid trade assets
          .filter(p => p.pos === theirNeedPos && !["OUT","IR"].includes(p.injury))
          .sort((a, b) => (b.fcValue || b.ppg * 100) - (a.fcValue || a.ppg * 100));
        if (!myAvailable.length) return;
        theirTargets.slice(0,2).forEach(target => {
          myAvailable.slice(0,2).forEach(offer => {
            if (offer.id === target.id) return;
            candidates.push({ give: [offer], receive: [target], myNeedPos, theirNeedPos });
          });
        });
        if (theirTargets[0] && myAvailable.length >= 2) {
          const myPair = myAvailable.slice(1,3);
          if (myPair.length === 2)
            candidates.push({ give: myPair, receive: [theirTargets[0]], myNeedPos, theirNeedPos, type: "upgrade" });
        }
        if (myAvailable[0] && theirTargets.length >= 2)
          candidates.push({ give: [myAvailable[0]], receive: theirTargets.slice(0,2), myNeedPos, theirNeedPos, type: "sell-high" });
      });
    });
    return candidates.slice(0, 20);
  },

  _scoreProposal(pkg, myProfile, theirProfile, players, settings) {
    const { give, receive } = pkg;
    const val = p => (p.fcValue || 0) * 0.6 + p.ppg * 100 * 0.4;
    const giveVal    = give.reduce((s,p) => s + val(p), 0);
    const receiveVal = receive.reduce((s,p) => s + val(p), 0);
    const valueDiff  = receiveVal - giveVal;
    const ratio      = giveVal > 0 ? receiveVal / giveVal : 1;
    const fairnessScore = Math.min(100, Math.max(0, Math.round(
      ratio >= 0.92 && ratio <= 1.18 ? 90 - Math.abs(ratio - 1) * 200
      : ratio > 1.18 ? 95 - (ratio - 1.18) * 100
      : 60 + ratio * 30
    )));
    const whyABenefits = this._buildBenefits(receive, give, myProfile, pkg.myNeedPos, "A");
    const whyBBenefits = this._buildBenefits(give, receive, theirProfile, pkg.theirNeedPos, "B");
    const { probability: acceptanceProbability, reasoning: acceptanceReasoning } =
      this._computeAcceptance(receive, give, myProfile, theirProfile, valueDiff, settings);
    const championshipOddsImpact = this._computeChampImpact(give, receive, myProfile, settings);
    const riskAssessment   = this._assessRisk(give, receive, myProfile, theirProfile);
    const byeAnalysis      = this._analyzeByeWeeks(give, receive);
    const scheduleAnalysis = this._analyzeSchedule(give, receive);
    return {
      id: `${myProfile.rosterId}-${theirProfile.rosterId}-${give.map(p=>p.id).join("")}-${receive.map(p=>p.id).join("")}`,
      give, receive, theirProfile, myProfile,
      type: pkg.type || "swap", myNeedPos: pkg.myNeedPos, theirNeedPos: pkg.theirNeedPos,
      fairnessScore: Math.round(fairnessScore),
      acceptanceProbability: Math.round(acceptanceProbability),
      championshipOddsImpact: parseFloat(championshipOddsImpact.toFixed(1)),
      valueDiffPPG: parseFloat((receive.reduce((s,p)=>s+p.ppg,0) - give.reduce((s,p)=>s+p.ppg,0)).toFixed(1)),
      valueDiffFC:  Math.round(receiveVal - giveVal),
      whyABenefits, whyBBenefits, acceptanceReasoning, riskAssessment, byeAnalysis, scheduleAnalysis,
    };
  },

  _buildBenefits(receive, give, profile, needPos, side) {
    const benefits = [];
    const recPPG = receive.reduce((s,p)=>s+p.ppg,0) / receive.length;
    const posAvg = profile.rosterStrength?.[needPos] || 0;
    if (recPPG > posAvg * 1.1) benefits.push(`Upgrades ${needPos} position from ${posAvg.toFixed(1)} to ${recPPG.toFixed(1)} PPG avg`);
    if (profile.weakPositions?.includes(needPos)) benefits.push(`Directly addresses ${needPos} weakness (currently graded ${profile.rosterGrades?.[needPos] || "C"})`);
    const curDepth = profile.depth?.[receive[0]?.pos] || 0;
    if (curDepth < 2 && receive.length >= 1) benefits.push(`Adds needed depth at ${receive[0].pos} (currently ${curDepth} healthy players)`);
    const trendingUp = receive.filter(p => p.trend === "up");
    if (trendingUp.length) benefits.push(`${trendingUp.map(p=>p.name).join(" & ")} trending up — ${trendingUp[0].last4Avg?.toFixed(1) || recPPG.toFixed(1)} PPG last 4 games`);
    const goodMatchup = receive.filter(p => ["A","B"].includes(p.matchup?.grade));
    if (goodMatchup.length) benefits.push(`${goodMatchup.map(p=>p.name).join(" & ")} has favorable upcoming schedule (matchup grade ${goodMatchup[0].matchup?.grade})`);
    const goodPlayoff = receive.filter(p => (p.playoffSosScore || 50) >= 65);
    if (goodPlayoff.length) benefits.push(`Strong playoff schedule for ${goodPlayoff.map(p=>p.name).join(" & ")} in weeks 15-17`);
    const givingInjured = give.filter(p => p.injury === "Q" || p.injury === "OUT");
    if (givingInjured.length) benefits.push(`Moves on from injury risk: ${givingInjured.map(p=>p.name).join(", ")} currently ${givingInjured[0].injury}`);
    if (!benefits.length) { benefits.push(`Gains ${recPPG.toFixed(1)} PPG production in a needed position`); benefits.push(`Improves lineup flexibility and depth`); }
    return benefits.slice(0, 4);
  },

  _computeAcceptance(receive, give, myProfile, theirProfile, valueDiff, settings) {
    let prob = theirProfile.acceptanceBaserate;
    const reasoning = [];
    if (theirProfile.tradeFreq >= 4) { prob += 12; reasoning.push(`${theirProfile.displayName} is a heavy trader (${theirProfile.tradeFreq} trades this season)`); }
    else if (theirProfile.tradeFreq >= 2) { prob += 5; reasoning.push(`${theirProfile.displayName} has traded ${theirProfile.tradeFreq} times this season — open to deals`); }
    else if (theirProfile.tradeFreq === 0) { prob -= 15; reasoning.push(`${theirProfile.displayName} has not made any trades this season — may prefer to stand pat`); }
    const receivePos = give.map(p => p.pos);
    const prefScore  = receivePos.reduce((s, pos) => s + (theirProfile.posPreferences?.[pos] || 25), 0);
    if (prefScore > 60) { prob += 10; reasoning.push(`Trade aligns with their historical positional preferences (${receivePos.join("/")} targets)`); }
    if (theirProfile.winNowBias >= 70 && theirProfile.playoffContention) { prob += 8; reasoning.push(`Currently ${theirProfile.record.wins}-${theirProfile.record.losses} — win-now mentality, likely to upgrade`); }
    else if (!theirProfile.playoffContention && theirProfile.winNowBias < 40) { prob -= 10; reasoning.push(`Out of playoff contention (${theirProfile.record.wins}-${theirProfile.record.losses}) — may be rebuilding`); }
    if (give.some(p => theirProfile.weakPositions?.includes(p.pos))) { prob += 12; reasoning.push(`Package fills their ${theirProfile.weakPositions?.join("/")} weakness`); }
    if (valueDiff > 300) { prob -= 18; reasoning.push(`They may feel the value exchange is imbalanced — consider sweetening the offer`); }
    else if (valueDiff < -200) { prob += 8; reasoning.push(`They receive good value in return — incentive to accept`); }
    if (theirProfile.waiverActivity >= 2) { prob += 6; reasoning.push(`Active on waivers (${theirProfile.waiverActivity.toFixed(1)}/week) — engaged manager`); }
    const givePosDepth = give.reduce((sum, p) => sum + (theirProfile.depth?.[p.pos] || 2), 0) / give.length;
    if (givePosDepth >= 3) { prob += 8; reasoning.push(`Roster depth at ${give.map(p=>p.pos).join("/")} allows them to trade from strength`); }
    else if (givePosDepth <= 1) { prob -= 12; reasoning.push(`Limited depth at ${give.map(p=>p.pos).join("/")} — may be reluctant to give up roster spots`); }
    if (!reasoning.length) reasoning.push(`Standard trade negotiation — value exchange is close to fair`);
    return { probability: Math.min(92, Math.max(8, Math.round(prob))), reasoning: reasoning.slice(0, 4) };
  },

  _computeChampImpact(give, receive, myProfile, settings) {
    const pPGDelta = receive.reduce((s,p)=>s+p.ppg,0) - give.reduce((s,p)=>s+p.ppg,0);
    const sosDelta = (receive.reduce((s,p)=>s+(p.playoffSosScore||50),0)/receive.length - give.reduce((s,p)=>s+(p.playoffSosScore||50),0)/give.length) / 100;
    const consDelta = (receive.reduce((s,p)=>s+(p.consistencyScore||50),0)/receive.length - give.reduce((s,p)=>s+(p.consistencyScore||50),0)/give.length) / 100;
    return Math.max(-15, Math.min(20, pPGDelta * 0.5 + sosDelta * 8 + consDelta * 5));
  },

  _assessRisk(give, receive, myProfile, theirProfile) {
    const factors = []; let level = "LOW";
    const injuredReceive = receive.filter(p => p.injury);
    if (injuredReceive.some(p => p.injury === "OUT" || p.injury === "IR")) { factors.push(`${injuredReceive.map(p=>p.name).join(", ")} currently ${injuredReceive[0].injury} — verify timeline before trading`); level = "HIGH"; }
    else if (injuredReceive.some(p => p.injury === "Q")) { factors.push(`${injuredReceive.map(p=>p.name).join(", ")} listed as Questionable — monitor status`); level = "MEDIUM"; }
    const trendingDown = receive.filter(p => p.trend === "down");
    if (trendingDown.length) { factors.push(`${trendingDown.map(p=>p.name).join(", ")} trending downward — check last 4 game log before trading`); if (level === "LOW") level = "MEDIUM"; }
    const highBust = receive.filter(p => (p.bustPct || 0) >= 35);
    if (highBust.length) { factors.push(`${highBust.map(p=>p.name).join(", ")} has ${highBust[0].bustPct}% bust rate — high weekly floor variance`); if (level === "LOW") level = "MEDIUM"; }
    const givingStrong = give.filter(p => (p.aiRecommendation?.confidence || 0) >= 75);
    if (givingStrong.length) factors.push(`Giving up ${givingStrong.map(p=>p.name).join(", ")} who are currently performing well — ensure it's worth it`);
    const badPlayoff = receive.filter(p => (p.playoffSosScore || 50) < 40);
    if (badPlayoff.length) { factors.push(`${badPlayoff.map(p=>p.name).join(", ")} faces tough playoff schedule in weeks 15-17`); if (level === "LOW") level = "MEDIUM"; }
    if (!factors.length) factors.push("No major red flags — standard execution risk of any trade");
    return { level, factors: factors.slice(0, 3) };
  },

  _analyzeByeWeeks(give, receive) {
    // bye is now a real field on every player object, sourced from Sleeper's
    // bye_week field during enrichment. No hardcoded season-specific map.
    const getBye = p => p.bye || null;
    const giveByes    = give.map(p => ({ name: p.name, bye: getBye(p) })).filter(x => x.bye);
    const receiveByes = receive.map(p => ({ name: p.name, bye: getBye(p) })).filter(x => x.bye);
    const byeCounts = {}; const conflicts = [];
    receiveByes.forEach(x => { byeCounts[x.bye] = (byeCounts[x.bye]||0) + 1; });
    Object.entries(byeCounts).forEach(([week, count]) => { if (count >= 2) conflicts.push(`${count} players on bye week ${week}`); });
    return { giveByes: giveByes.map(x=>`${x.name} (BYE ${x.bye})`), receiveByes: receiveByes.map(x=>`${x.name} (BYE ${x.bye})`), conflicts };
  },

  _analyzeSchedule(give, receive) {
    const gv = arr => arr.reduce((s,p)=>s+(p.matchup?.grade==="A"?4:p.matchup?.grade==="B"?3:p.matchup?.grade==="C"?2:1),0)/(arr.length||1);
    const avgGiveMatchup = gv(give); const avgReceiveMatchup = gv(receive);
    const avgReceiveSOS = receive.reduce((s,p)=>s+(p.sosScore||50),0)/(receive.length||1);
    const avgGiveSOS    = give.reduce((s,p)=>s+(p.sosScore||50),0)/(give.length||1);
    const avgReceivePlayoff = receive.reduce((s,p)=>s+(p.playoffSosScore||50),0)/(receive.length||1);
    const avgGivePlayoff    = give.reduce((s,p)=>s+(p.playoffSosScore||50),0)/(give.length||1);
    return {
      weekMatchupAdvantage: avgReceiveMatchup > avgGiveMatchup,
      sosAdvantage: avgReceiveSOS > avgGiveSOS,
      playoffAdvantage: avgReceivePlayoff > avgGivePlayoff,
      receiveMatchupLabel: avgReceiveMatchup >= 3.5 ? "Elite" : avgReceiveMatchup >= 2.5 ? "Favorable" : "Average",
      giveMatchupLabel:    avgGiveMatchup    >= 3.5 ? "Elite" : avgGiveMatchup    >= 2.5 ? "Favorable" : "Average",
      avgReceivePlayoffSOS: Math.round(avgReceivePlayoff),
      avgGivePlayoffSOS:    Math.round(avgGivePlayoff),
    };
  },
};
