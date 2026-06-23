export const AIExplanationEngine = {
  generate(p) {
    // ── Route K and DST to specialized recommendation paths ───────────────
    if (p.pos === "DST") return this._generateDST(p);
    if (p.pos === "K")   return this._generateK(p);
    const staleFlags = p.staleFlags || [];

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

    // Tiered injury risk warnings — aligned with recalibrated injuryRiskScore values:
    //   < 30  → Out(10), IR(5)        — confirmed absence
    //   < 55  → Doubtful(35), PUP(45) — significant concern
    //   < 82  → Questionable(78)      — mild caution (real game-week tag only)
    //   ≥ 82  → REC(85), Healthy(90)  — no warning (offseason recovery or healthy)
    if (p.injuryRiskScore < 30)
      riskFactors.push(`${p.injStatus} — confirmed absence, do not start`);
    else if (p.injuryRiskScore < 55)
      riskFactors.push(`Injury concern (${p.injStatus}) — monitor practice reports`);
    else if (p.injuryRiskScore < 82)
      riskFactors.push(`Q designation (${p.injStatus}) — verify active pre-game`);

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

    // ── Staleness risk factors ─────────────────────────────────────────────
    // Added BEFORE verdict so they appear in riskFactors and count toward score.
    if (staleFlags.includes("stale_projection"))
      riskFactors.push(`Projection data over 30 min old — confidence reduced`);
    if (staleFlags.includes("stale_injury"))
      riskFactors.push(`Injury report over 30 min old — verify current status`);
    if (staleFlags.includes("missing_opponent"))
      riskFactors.push(`No opponent data for this week — schedule unconfirmed`);

    if (!reasons.length)     reasons.push(`${p.ppg} projected PPG for ${p.pos} this week`);
    if (!riskFactors.length) riskFactors.push(`No major red flags — standard weekly variance applies`);

    const { action, confidence, _penalties, _bonuses } = this._verdict(p, reasons.length, riskFactors.length, staleFlags);

    return {
      action, confidence,
      reasons:     reasons.slice(0, 5),
      riskFactors: riskFactors.slice(0, 3),
      strengths:   reasons.slice(0, 3).map(r => r.split(" — ")[0] || r),
      _penalties, _bonuses,
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

    const { action, confidence, _penalties, _bonuses } = this._verdict({
      ...p, opportunityScore: 50, injuryRiskScore: 90,
    }, reasons.length, riskFactors.length, p.staleFlags || []);
    return { action, confidence, reasons: reasons.slice(0, 5), riskFactors: riskFactors.slice(0, 3), strengths: reasons.slice(0, 3).map(r => r.split(" — ")[0] || r), _penalties, _bonuses };
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

    const { action, confidence, _penalties, _bonuses } = this._verdict({
      ...p, opportunityScore: 50, injuryRiskScore: p.injuryRiskScore ?? 90,
    }, reasons.length, riskFactors.length, p.staleFlags || []);
    return { action, confidence, reasons: reasons.slice(0, 5), riskFactors: riskFactors.slice(0, 3), strengths: reasons.slice(0, 3).map(r => r.split(" — ")[0] || r), _penalties, _bonuses };
  },


  _verdict(p, reasonCount, riskCount, staleFlags = []) {
    // ── Safe numeric coercion ─────────────────────────────────────────────
    const n = v => (typeof v === "number" && isFinite(v)) ? v : 0;

    const opportunityScore = n(p.opportunityScore);
    const consistencyScore = n(p.consistencyScore);
    const boomPct          = n(p.boomPct);
    const bustPct          = n(p.bustPct);
    const injuryRiskScore  = n(p.injuryRiskScore) || 90;

    // ── Early exit for confirmed absence (Out=10, IR=5) ──────────────────
    if (injuryRiskScore < 30) return { action: "SIT", confidence: 85, _penalties: [{ reason: "confirmed_absence", amount: -999 }], _bonuses: [] };

    // ── Score accumulation ────────────────────────────────────────────────
    const _bonuses   = [];
    const _penalties = [];

    let score = 50;

    const oppContrib = opportunityScore * 0.3;
    score += oppContrib;
    if (oppContrib > 0) _bonuses.push({ reason: "opportunity_score", amount: Math.round(oppContrib * 10) / 10 });

    const consContrib = consistencyScore * 0.15;
    score += consContrib;
    if (consContrib > 0) _bonuses.push({ reason: "consistency_score", amount: Math.round(consContrib * 10) / 10 });

    const bbContrib = (boomPct - bustPct) * 0.2;
    score += bbContrib;
    if (bbContrib > 0) _bonuses.push({ reason: "boom_bust_spread", amount: Math.round(bbContrib * 10) / 10 });
    else if (bbContrib < 0) _penalties.push({ reason: "boom_bust_spread", amount: Math.round(bbContrib * 10) / 10 });

    const matchupBonus = p.matchupGrade === "A" ? 10 : p.matchupGrade === "B" ? 5 : p.matchupGrade === "D" ? -8 : 0;
    score += matchupBonus;
    if (matchupBonus > 0) _bonuses.push({ reason: `matchup_grade_${p.matchupGrade}`, amount: matchupBonus });
    else if (matchupBonus < 0) _penalties.push({ reason: `matchup_grade_${p.matchupGrade}`, amount: matchupBonus });

    const trendBonus = p.trendDir === "up" ? 5 : p.trendDir === "down" ? -5 : 0;
    score += trendBonus;
    if (trendBonus > 0) _bonuses.push({ reason: "trending_up", amount: trendBonus });
    else if (trendBonus < 0) _penalties.push({ reason: "trending_down", amount: trendBonus });

    const reasonBonus = (n(reasonCount) - n(riskCount)) * 2;
    score += reasonBonus;
    if (reasonBonus > 0) _bonuses.push({ reason: "reason_surplus", amount: Math.round(reasonBonus * 10) / 10 });
    else if (reasonBonus < 0) _penalties.push({ reason: "risk_surplus", amount: Math.round(reasonBonus * 10) / 10 });

    const injPenalty = -(100 - injuryRiskScore) * 0.3;
    score += injPenalty;
    if (injPenalty < 0) _penalties.push({ reason: "injury_risk", amount: Math.round(injPenalty * 10) / 10 });

    // ── Staleness penalties ────────────────────────────────────────────────
    if (staleFlags.includes("stale_projection")) {
      score -= 8;
      _penalties.push({ reason: "stale_projection", amount: -8 });
    }
    if (staleFlags.includes("stale_injury")) {
      score -= 5;
      _penalties.push({ reason: "stale_injury", amount: -5 });
    }
    if (staleFlags.includes("missing_opponent")) {
      score -= 10;
      _penalties.push({ reason: "missing_opponent", amount: -10 });
    }

    // ── Final guard ───────────────────────────────────────────────────────
    const raw  = Math.min(97, Math.max(35, Math.round(score)));
    const conf = isFinite(raw) ? raw : 50;

    const action =
      conf >= 75 ? "START" :
      conf >= 60 ? "LEAN START" :
      conf >= 45 ? "NEUTRAL" :
      conf >= 35 ? "LEAN SIT" : "SIT";

    return { action, confidence: conf, _penalties, _bonuses };
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
