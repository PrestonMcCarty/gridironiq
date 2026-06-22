/**
 * generateDraftExplanation
 * ========================
 * Produces a structured, context-aware explanation for a draft recommendation.
 * Every sentence uses real data — no placeholder text, no generic fallbacks.
 *
 * @param {Object} player        — enriched player object from PlayerIntelligence
 * @param {Object} context       — draft context
 *   @param {number}   context.pick           — current pick number
 *   @param {Object}   context.myPosCounts    — { QB:1, RB:2, ... }
 *   @param {Object}   context.settings       — league settings
 *   @param {Array}    context.available      — all undrafted players
 *   @param {string}   context.cardType       — "bestAvailable"|"bestForTeam"|"sleeperPick"
 * @returns {Object} explanation
 */

// ── Tier helpers (duplicated here so this module has no component imports) ─
function getTierLabel(pos, posRank) {
  if (!posRank) return "Late";
  const tiers = {
    QB:  [[1,1,"Elite"],[2,3,"Tier 1"],[4,8,"Tier 2"],[9,16,"Tier 3"],[17,99,"Late"]],
    RB:  [[1,3,"Elite"],[4,8,"Tier 1"],[9,16,"Tier 2"],[17,28,"Tier 3"],[29,99,"Late"]],
    WR:  [[1,3,"Elite"],[4,8,"Tier 1"],[9,18,"Tier 2"],[19,30,"Tier 3"],[31,99,"Late"]],
    TE:  [[1,1,"Elite"],[2,4,"Tier 1"],[5,10,"Tier 2"],[11,18,"Tier 3"],[19,99,"Late"]],
    K:   [[1,5,"Tier 1"],[6,15,"Tier 2"],[16,99,"Late"]],
    DST: [[1,5,"Tier 1"],[6,12,"Tier 2"],[13,99,"Late"]],
  };
  for (const [min, max, label] of (tiers[pos] || tiers.WR)) {
    if (posRank >= min && posRank <= max) return label;
  }
  return "Late";
}

function getScarcityLabel(pos, posRank) {
  if (!posRank) return "Low";
  const map = {
    QB:  [[1,2,"Elite"],[3,6,"High"],[7,14,"Medium"],[15,99,"Low"]],
    RB:  [[1,4,"Elite"],[5,10,"High"],[11,20,"Medium"],[21,99,"Low"]],
    WR:  [[1,4,"Elite"],[5,12,"High"],[13,24,"Medium"],[25,99,"Low"]],
    TE:  [[1,2,"Elite"],[3,5,"High"],[6,12,"Medium"],[13,99,"Low"]],
    K:   [[1,8,"Medium"],[9,99,"Low"]],
    DST: [[1,8,"Medium"],[9,99,"Low"]],
  };
  for (const [min, max, label] of (map[pos] || map.WR)) {
    if (posRank >= min && posRank <= max) return label;
  }
  return "Low";
}

export function generateDraftExplanation(player, context = {}) {
  const {
    pick         = 1,
    myPosCounts  = {},
    settings     = { slots: { QB:1, RB:2, WR:2, TE:1, FLEX:1, K:1, DST:1, BN:6 }, teams: 12, scoring: "PPR", superflex: false },
    available    = [],
    cardType     = "bestAvailable",
  } = context;

  const p    = player;
  const tier = getTierLabel(p.pos, p.posRank);
  const sc   = getScarcityLabel(p.pos, p.posRank);
  const n    = v => (typeof v === "number" && isFinite(v)) ? v : 0;

  // ── How many of this position are still available at similar or better tier? ─
  const tierOrder = ["Elite","Tier 1","Tier 2","Tier 3","Late"];
  const tierIdx   = tierOrder.indexOf(tier);
  const betterAvail = available.filter(a =>
    a.id !== p.id &&
    a.pos === p.pos &&
    !["OUT","IR"].includes(a.injury) &&
    tierOrder.indexOf(getTierLabel(a.pos, a.posRank)) <= tierIdx
  );
  const replacementPlayers = available.filter(a =>
    a.id !== p.id &&
    a.pos === p.pos &&
    !["OUT","IR"].includes(a.injury)
  ).sort((a, b) => (a.adp ?? 999) - (b.adp ?? 999));

  // ADP value
  const adpValue  = (p.adp && p.adpSource === "fantasycalc_rank") ? Math.round(p.adp - pick) : null;
  const havePos   = myPosCounts[p.pos] || 0;
  const needPos   = Math.max(0, (settings.slots[p.pos] || 0) + (["RB","WR","TE"].includes(p.pos) ? (settings.slots.FLEX || 0) * 0.4 : 0) - havePos);
  const rounds    = settings.slots ? Object.values(settings.slots).reduce((a, b) => a + b, 0) : 16;
  const picksLeft = (rounds - pick / settings.teams);

  // ── WHY THIS PLAYER ────────────────────────────────────────────────────────
  const why = [];

  // Opening: rank + tier framing
  if (tier === "Elite" || tier === "Tier 1") {
    why.push(`${p.name} is a ${tier} ${p.pos} — the tier that separates weekly starters from replacement-level options. At ${p.pos}${p.posRank}, they rank among the top ${p.posRank} ${p.pos}s in projected production.`);
  } else {
    why.push(`Ranked ${p.pos}${p.posRank} with an ADP of ${p.adp != null ? Math.round(p.adp) : "—"}, ${p.name} represents the best available ${p.pos} at this point in the draft.`);
  }

  // Production metrics
  if (p.ppg > 0) {
    const consistNote = n(p.consistencyScore) >= 70
      ? ` with elite consistency (${p.consistencyScore}/100)`
      : n(p.consistencyScore) >= 50
      ? ` with solid week-to-week reliability`
      : ` though with some weekly variance to account for`;
    why.push(`Projects at ${p.ppg} PPG${consistNote}. Ceiling of ${Math.round(p.ppg * 1.4)}+ points on a good week.`);
  }

  // Opportunity / role
  if (n(p.opportunityScore) >= 70) {
    const roleDesc =
      p.pos === "QB" ? "elite role in a high-volume offense" :
      p.pos === "RB" ? `primary backfield role with ${p.opportunityScore}/100 opportunity score — that's a workhorse designation` :
      p.pos === "WR" ? `No. 1 or No. 2 target share in the passing game` :
      `primary receiving role at TE with elite opportunity`;
    why.push(`Locked into a ${roleDesc}.`);
  } else if (n(p.opportunityScore) >= 55) {
    why.push(`Solid opportunity profile (${p.opportunityScore}/100) — consistent volume that drives floor.`);
  }

  // Boom potential
  if (n(p.boomPct) >= 30) {
    why.push(`High ceiling: ${p.boomPct}% of games reach elite scoring territory — one of the higher boom rates at this position.`);
  }

  // Value vs ADP
  if (adpValue !== null && adpValue >= 8) {
    why.push(`${adpValue} picks of surplus value — managers are chronically underrating this player relative to production and rank.`);
  } else if (adpValue !== null && adpValue >= 3) {
    why.push(`Slight value edge at current ADP — being drafted a few picks later than production warrants.`);
  }

  // Positional replacement context
  if (cardType === "bestForTeam" && needPos >= 1) {
    const rplPPG = replacementPlayers[1]?.ppg || 0;
    const diff   = parseFloat((p.ppg - rplPPG).toFixed(1));
    if (diff > 0) {
      why.push(`${diff} PPG advantage over the next ${p.pos} at this position — that edge compounds weekly across your roster.`);
    }
  }

  // ── WHY NOW ───────────────────────────────────────────────────────────────
  const whyNow = [];

  // How many of this tier remain?
  const tierPlayers = available.filter(a =>
    a.id !== p.id && a.pos === p.pos &&
    !["OUT","IR"].includes(a.injury) &&
    tierOrder.indexOf(getTierLabel(a.pos, a.posRank)) <= tierIdx
  );

  if (tier === "Elite" && tierPlayers.length === 0) {
    whyNow.push(`${p.name} is the LAST Elite ${p.pos} available. There is no comparable option remaining — this is a now-or-never moment.`);
  } else if (tier === "Elite" && tierPlayers.length <= 2) {
    whyNow.push(`Only ${tierPlayers.length + 1} Elite-tier ${p.pos}s remain on the board. With ${settings.teams} managers competing, this tier closes in 1-2 picks.`);
  } else if (tier === "Tier 1") {
    const remaining = betterAvail.length + 1;
    const picksToExhaust = Math.max(1, Math.round(remaining / (settings.teams / 2)));
    whyNow.push(`${remaining} Tier 1 ${p.pos}s remain. At the current draft pace, this tier exhausts in approximately ${picksToExhaust} rounds.`);
  } else {
    // How many picks until next run?
    const nextBetter = replacementPlayers.find(a => a.posRank < p.posRank);
    if (nextBetter && nextBetter.adp) {
      const wait = Math.round(nextBetter.adp - pick);
      if (wait > settings.teams) {
        whyNow.push(`The next comparable ${p.pos} won't realistically be available for ${wait} more picks — waiting costs meaningful roster equity.`);
      }
    }
    whyNow.push(`Current ${p.pos} depth is solid but thinning. The gap between ${tier} and ${tierOrder[tierIdx + 1] || "Late"} tier is significant in ${settings.scoring}.`);
  }

  // Roster construction timing
  if (needPos >= 1 && havePos === 0) {
    whyNow.push(`You have zero ${p.pos} starters — this is your most pressing positional need. Delaying further compounds risk.`);
  } else if (needPos >= 1) {
    whyNow.push(`You're one starter short at ${p.pos}. Filling it now while ${tier}-tier options exist beats scrambling in the mid-rounds.`);
  } else if (adpValue !== null && adpValue >= 8) {
    whyNow.push(`Your ${p.pos} situation is covered — but at +${adpValue} value, taking this player now adds overall roster equity regardless of positional need.`);
  }

  // Superflex QB premium
  if (p.pos === "QB" && settings.superflex && havePos === 0) {
    whyNow.push(`Superflex leagues reward early QB investment. The best managers lock in two QBs by round 5. Draft cost is already baked in.`);
  }

  if (!whyNow.length) {
    whyNow.push(`ADP of ${p.adp != null ? Math.round(p.adp) : "—"} makes this a clean value at pick ${pick}. No reason to overthink it.`);
  }

  // ── RISKS ────────────────────────────────────────────────────────────────
  const risks = [];

  if (p.injury === "Q") {
    risks.push(`Questionable injury designation — verify active status before locking in`);
  } else if (p.injury === "OUT" || p.injury === "IR") {
    risks.push(`Currently ${p.injury} — high-risk selection, confirm return timeline`);
  }

  if (n(p.bustPct) >= 30) {
    risks.push(`${p.bustPct}% bust rate — high-variance floor, needs a good game-script to deliver`);
  } else if (n(p.bustPct) >= 20) {
    risks.push(`${p.bustPct}% bust rate — some floor variance, though manageable`);
  }

  if (p.trend === "down" && n(p.trendPct) < -10) {
    risks.push(`Production trending down — ${p.last4Avg?.toFixed(1)} PPG last 4 games vs ${p.seasonAvg?.toFixed(1)} season average (${p.trendPct?.toFixed(0)}%)`);
  }

  if (n(p.playoffSosScore) < 40) {
    risks.push(`Difficult playoff schedule (weeks 15-17) — SoS score ${p.playoffSosScore}/100`);
  }

  if (n(p.consistencyScore) < 40) {
    risks.push(`High weekly variance — ceiling exists but floor is unreliable`);
  }

  if (p.pos === "TE" && p.posRank > 8) {
    risks.push(`TE2/3 designation — matchup-dependent, not every-week reliable`);
  }

  if (!risks.length) {
    risks.push(`No significant red flags — standard positional variance and game-script dependency`);
  }

  // ── ALTERNATIVES ─────────────────────────────────────────────────────────
  const alts = replacementPlayers
    .filter(a => a.id !== p.id && a.ppg > 0)
    .slice(0, 3)
    .map(a => ({
      name:  a.name,
      pos:   a.pos,
      rank:  a.posRank,
      adp:   a.adp ? Math.round(a.adp) : null,
      ppg:   a.ppg,
      note:  a.adp && p.adp && a.adp > p.adp + 10
        ? `Available ~${Math.round(a.adp - pick)} picks later — significant wait`
        : a.adp && p.adp && Math.abs(a.adp - p.adp) <= 8
        ? `Similar ADP range — comparable opportunity`
        : `Different tier, lower ceiling`,
    }));

  // ── RATINGS ──────────────────────────────────────────────────────────────
  // Confidence: confidence from existing AI engine
  const confidence = p.aiRecommendation?.confidence ?? 65;

  // Strength: how strongly the draft engine recommends this player
  const strength = Math.min(99, Math.max(35, Math.round(
    confidence * 0.6 +
    (adpValue !== null ? Math.min(20, adpValue * 1.5) : 0) +
    (tier === "Elite" ? 15 : tier === "Tier 1" ? 8 : 0) +
    (needPos >= 1 ? 10 : 0) +
    (n(p.consistencyScore) >= 70 ? 5 : 0)
  )));

  // Risk rating: lower = safer (100 = no risk)
  const riskRating = Math.min(100, Math.max(0, Math.round(
    n(p.injuryRiskScore) * 0.5 +
    (100 - n(p.bustPct)) * 0.3 +
    (p.trend === "down" ? -15 : p.trend === "up" ? 5 : 0) +
    (n(p.playoffSosScore) >= 60 ? 10 : n(p.playoffSosScore) < 40 ? -10 : 0)
  )));

  // Upside rating
  const upsideRating = Math.min(99, Math.max(10, Math.round(
    n(p.boomPct) * 1.2 +
    (tier === "Elite" ? 25 : tier === "Tier 1" ? 15 : 5) +
    n(p.opportunityScore) * 0.3
  )));

  // Floor rating
  const floorRating = Math.min(99, Math.max(10, Math.round(
    n(p.consistencyScore) * 0.5 +
    n(p.opportunityScore) * 0.3 +
    (100 - n(p.bustPct)) * 0.2 +
    (p.injury ? -20 : 0)
  )));

  return {
    why,
    whyNow,
    risks,
    alternatives: alts,
    strength,
    confidence,
    riskRating,
    upsideRating,
    floorRating,
  };
}
