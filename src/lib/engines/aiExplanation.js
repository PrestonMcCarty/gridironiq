export const AIExplanationEngine = {
  generate(p) {
    // ── Route K and DST to specialized recommendation paths ───────────────
    if (p.pos === "DST") return this._generateDST(p);
    if (p.pos === "K")   return this._generateK(p);

    // ── Skill player path (QB / RB / WR / TE) ────────────────────────────
    const reasons     = [];
    const riskFactors = [];

    if (p.opportunityScore >= 75)
      reasons.push(`${p.pos}1 usage profile — elite opportunity score (${p.opportunityScore}/100)`);
    else if (p.opportunityScore >= 60)
      reasons.push(`Strong ${p.pos} role — above-average opportunity (${p.opportunityScore}/100)`);

    if (p.last4Avg > p.last8Avg * 1.1 && p.last4Avg > 0)
      reasons.push(`Positive trend: ${p.last4Avg.toFixed(1)} PPG last 4 games vs ${p.last8Avg.toFixed(1)} over last 8 (+${p.trendPct.toFixed(0)}%)`);
    else if (p.last4Avg > 0 && p.last4Avg >= p.seasonAvg * 0.95)
      reasons.push(`Consistent with season average — ${p.last4Avg.toFixed(1)} PPG last 4 games`);

    if (p.matchupGrade === "A")
      reasons.push(`Elite matchup vs ${p.oppTeam || "opp"} (#${p.rawDefRank} def vs ${p.pos})`);
    else if (p.matchupGrade === "B")
      reasons.push(`Favorable matchup vs ${p.oppTeam || "opp"} (#${p.rawDefRank} def vs ${p.pos})`);

    if (p.boomPct >= 35)
      reasons.push(`High ceiling — ${p.boomPct}% boom rate (30+ pts) historically`);

    if (p.playoffSosScore >= 70)
      reasons.push(`Favorable playoff schedule — strong SoS in weeks 15-17`);
    else if (p.playoffSosScore >= 55)
      reasons.push(`Above-average playoff schedule outlook`);

    if (p.consistencyScore >= 70)
      reasons.push(`Elite consistency — ${p.consistencyScore}/100 consistency score`);

    if (p.adp && p.ppg > 0 && p.adp > 30 && p.ppg / (p.adp / 10) > 1.4)
      reasons.push(`Strong value vs ADP ${p.adp?.toFixed(1)} — projecting ${p.ppg} PPG`);

    if (p.fcValue && p.fcValue >= 8000) reasons.push(`Top FantasyCalc redraft value (${p.fcValue})`);
    else if (p.fcValue && p.fcValue >= 6000) reasons.push(`Strong FantasyCalc trade value (${p.fcValue})`);

    if (p.pos === "RB" && p.opportunityScore >= 70) reasons.push(`Top 5 projected workload at RB`);
    if (p.pos === "WR" && p.last4Avg >= 20) reasons.push(`Elite receiving usage — ${p.last4Avg.toFixed(1)} PPG last month`);
    if (p.pos === "TE" && p.opportunityScore >= 65) reasons.push(`Elite target share for TE — scarce position value`);

    if (p.injuryRiskScore < 30)
      riskFactors.push(`${p.injStatus} — significant injury risk, check status`);
    else if (p.injuryRiskScore < 65)
      riskFactors.push(`Injury concern (${p.injStatus}) — monitor practice reports`);

    if (p.bustPct >= 35)
      riskFactors.push(`${p.bustPct}% bust rate historically — high floor variance`);
    else if (p.bustPct >= 20)
      riskFactors.push(`Moderate floor risk — ${p.bustPct}% sub-10 pt games`);

    // Only flag matchup as a risk when we have confirmed opponent data.
    // Missing opponent_abbr defaults to grade "C" — never penalise a player for missing data.
    if (p.oppTeam && p.matchupGrade === "D")
      riskFactors.push(`Tough matchup vs ${p.oppTeam} (#${p.rawDefRank} def vs ${p.pos})`);
    else if (p.oppTeam && p.matchupGrade === "C")
      riskFactors.push(`Neutral matchup — no free points this week`);

    if (p.last4Avg < p.last8Avg * 0.85 && p.last8Avg > 0)
      riskFactors.push(`Negative trend: ${p.last4Avg.toFixed(1)} PPG last 4 vs ${p.last8Avg.toFixed(1)} last 8`);

    if (p.trendDir === "down") riskFactors.push(`Downward trend — declining production last 4 games`);
    if (p.playoffSosScore < 40) riskFactors.push(`Difficult playoff schedule in weeks 15-17`);
    if (p.consistencyScore < 40) riskFactors.push(`High variance player — inconsistent weekly production`);
    if (p.opportunityScore < 45) riskFactors.push(`Below-average opportunity score — usage concerns`);

    if (!reasons.length)     reasons.push(`${p.ppg} projected PPG for ${p.pos} this week`);
    if (!riskFactors.length) riskFactors.push(`No major red flags — standard weekly variance applies`);

    const { action, confidence } = this._verdict(p, reasons.length, riskFactors.length);

    return {
      action, confidence,
      reasons:     reasons.slice(0, 5),
      riskFactors: riskFactors.slice(0, 3),
      strengths:   reasons.slice(0, 3).map(r => r.split(" — ")[0] || r),
    };
  },

  _generateDST(p) {
    const reasons     = [];
    const riskFactors = [];
    const opp = p.oppTeam || "opp";

    if (p.matchupGrade === "A")
      reasons.push(`Elite matchup vs ${opp} — vulnerable offense allows big DST weeks`);
    else if (p.matchupGrade === "B")
      reasons.push(`Favorable matchup vs ${opp} — expect above-average DST production`);

    if (p.last4Avg > p.last8Avg * 1.1 && p.last4Avg > 0)
      reasons.push(`Hot DST — ${p.last4Avg.toFixed(1)} PPG last 4 games vs ${p.last8Avg.toFixed(1)} season avg`);
    else if (p.last4Avg > 0 && p.last4Avg >= p.seasonAvg * 0.95)
      reasons.push(`Consistent DST scoring — ${p.last4Avg.toFixed(1)} PPG last 4 games`);

    if (p.boomPct >= 30)
      reasons.push(`${p.boomPct}% of games with 15+ pts — high ceiling DST`);

    if (p.playoffSosScore >= 65)
      reasons.push(`Favorable playoff schedule — strong matchups in weeks 15-17`);

    if (p.consistencyScore >= 65)
      reasons.push(`Elite DST consistency — ${p.consistencyScore}/100 score`);

    if (p.adp && p.adp > 120)
      reasons.push(`Late-round DST value — ADP ${p.adp?.toFixed(0)} with strong floor`);

    // Risk factors
    if (p.matchupGrade === "D")
      riskFactors.push(`Tough matchup vs ${opp} — high-powered offense, stream alternatives`);
    else if (p.matchupGrade === "C")
      riskFactors.push(`Neutral matchup vs ${opp} — floor/ceiling both limited`);

    if (p.bustPct >= 35)
      riskFactors.push(`${p.bustPct}% of games with 3 pts or fewer — volatile floor`);

    if (p.last4Avg < p.last8Avg * 0.8 && p.last8Avg > 0)
      riskFactors.push(`DST cooling off — ${p.last4Avg.toFixed(1)} PPG last 4 vs ${p.last8Avg.toFixed(1)} prior`);

    if (!reasons.length)     reasons.push(`${p.name} DST — projecting ${p.ppg} pts this week`);
    if (!riskFactors.length) riskFactors.push(`Standard DST variance — monitor game-script`);

    const { action, confidence } = this._verdict({
      ...p, opportunityScore: 50, injuryRiskScore: 90,
    }, reasons.length, riskFactors.length);
    return { action, confidence, reasons: reasons.slice(0, 5), riskFactors: riskFactors.slice(0, 3), strengths: reasons.slice(0, 3).map(r => r.split(" — ")[0] || r) };
  },

  _generateK(p) {
    const reasons     = [];
    const riskFactors = [];
    const opp = p.oppTeam || "opp";

    if (p.matchupGrade === "A")
      reasons.push(`Favorable kicker matchup vs ${opp} — expect more field goal attempts`);
    else if (p.matchupGrade === "B")
      reasons.push(`Good matchup vs ${opp} — above-average scoring environment`);

    if (p.last4Avg > p.last8Avg * 1.1 && p.last4Avg > 0)
      reasons.push(`Hot kicker — ${p.last4Avg.toFixed(1)} PPG last 4 games`);
    else if (p.last4Avg > 0 && p.last4Avg >= p.seasonAvg * 0.9)
      reasons.push(`Consistent production — ${p.last4Avg.toFixed(1)} PPG last 4 games`);

    if (p.boomPct >= 25)
      reasons.push(`${p.boomPct}% of games with 12+ pts — high ceiling kicker`);

    if (p.consistencyScore >= 60)
      reasons.push(`Elite kicker consistency — ${p.consistencyScore}/100 score`);

    if (p.adp && p.adp > 140)
      reasons.push(`Premium late-round kicker — ADP ${p.adp?.toFixed(0)}`);

    if (p.injury === "Q")
      riskFactors.push(`Questionable injury designation — verify active status`);

    if (p.matchupGrade === "D")
      riskFactors.push(`Tough matchup vs ${opp} — low-scoring environment likely`);

    if (p.bustPct >= 30)
      riskFactors.push(`${p.bustPct}% bust rate — inconsistent attempt volume`);

    if (!reasons.length)     reasons.push(`${p.name} (K) — projecting ${p.ppg} pts this week`);
    if (!riskFactors.length) riskFactors.push(`Standard kicker variance — dependent on offense`);

    const { action, confidence } = this._verdict({
      ...p, opportunityScore: 50, injuryRiskScore: p.injuryRiskScore ?? 90,
    }, reasons.length, riskFactors.length);
    return { action, confidence, reasons: reasons.slice(0, 5), riskFactors: riskFactors.slice(0, 3), strengths: reasons.slice(0, 3).map(r => r.split(" — ")[0] || r) };
  },


  _verdict(p, reasonCount, riskCount) {
    // ── Safe numeric coercion ─────────────────────────────────────────────
    // Any value that is undefined, null, or NaN becomes 0.
    // This is the single point where all upstream undefined/NaN values are
    // neutralised before they can corrupt the score accumulation.
    const n = v => (typeof v === "number" && isFinite(v)) ? v : 0;

    // ── Resolved inputs ───────────────────────────────────────────────────
    const opportunityScore  = n(p.opportunityScore);   // 0-100, defaults 0
    const consistencyScore  = n(p.consistencyScore);   // 0-100, defaults 0
    const boomPct           = n(p.boomPct);            // 0-100, defaults 0
    const bustPct           = n(p.bustPct);            // 0-100, defaults 0
    // injuryRiskScore: undefined < 25 is false in JS, so the early-exit
    // guard below would silently skip.  Resolve it explicitly first.
    const injuryRiskScore   = n(p.injuryRiskScore) || 90; // 0-100, defaults 90 (healthy)

    // ── Early exit for confirmed injury ──────────────────────────────────
    // Must come after injuryRiskScore is resolved, not before, so that
    // undefined injuryRiskScore doesn't bypass the guard.
    if (injuryRiskScore < 25) return { action: "SIT", confidence: 85 };

    // ── Score accumulation ────────────────────────────────────────────────
    let score = 50;
    score += opportunityScore * 0.3;
    score += consistencyScore * 0.15;
    score += (boomPct - bustPct) * 0.2;
    score += (p.matchupGrade === "A" ? 10 : p.matchupGrade === "B" ? 5 : p.matchupGrade === "D" ? -8 : 0);
    score += (p.trendDir === "up" ? 5 : p.trendDir === "down" ? -5 : 0);
    score += (n(reasonCount) - n(riskCount)) * 2;
    score -= (100 - injuryRiskScore) * 0.3;

    // ── Final guard ───────────────────────────────────────────────────────
    // Clamp to [35, 97].  If score is still somehow NaN (should not happen
    // after the guards above), default to 50 rather than displaying "NaN%".
    const raw  = Math.min(97, Math.max(35, Math.round(score)));
    const conf = isFinite(raw) ? raw : 50;

    const action =
      conf >= 75 ? "START" :
      conf >= 60 ? "LEAN START" :
      conf >= 45 ? "NEUTRAL" :
      conf >= 35 ? "LEAN SIT" : "SIT";

    return { action, confidence: conf };
  },

  matchupSummary({ name, pos, oppTeam, rawDefRank, matchupGrade, trendDir }) {
    const tier = matchupGrade === "A"
      ? `ranks #${rawDefRank} vs ${pos}s — one of the best matchups on the slate`
      : matchupGrade === "B" ? `ranks #${rawDefRank} vs ${pos}s — a favorable draw`
      : matchupGrade === "C" ? `ranks #${rawDefRank} vs ${pos}s — a neutral matchup`
      : `ranks #${rawDefRank} vs ${pos}s — a difficult draw`;
    return `${oppTeam} ${tier}. ${name} ${trendDir === "up" ? "is trending up" : trendDir === "down" ? "has cooled off recently" : "has been consistent"} and projects well in this spot.`;
  },
};
