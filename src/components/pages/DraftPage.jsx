"use client";
import { useState, useMemo } from "react";
import { C, gradeColor, posColor } from "@/lib/theme";
import { usePlayersCtx } from "@/hooks/usePlayersContext";
import { InjuryBadge, PosBadge, TrendIcon, Skeleton } from "@/components/ui/Badges";
import { SyncIcon } from "@/components/ui/Icons";
import { DataStatusBanner } from "@/components/ui/DataStatusBanner";
import { PlayerModal } from "@/components/player/PlayerModal";
import { RecCard } from "@/components/player/RecCard";
import { SleeperSync } from "@/components/player/SleeperSync";
import { generateDraftExplanation } from "@/lib/engines/generateDraftExplanation";

// ── Helper functions — defined at module scope so they are never in TDZ ───────
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
  const table = (tiers[pos] || tiers.WR);
  for (const [min, max, label] of table) { if (posRank >= min && posRank <= max) return label; }
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
  const table = (map[pos] || map.WR);
  for (const [min, max, label] of table) { if (posRank >= min && posRank <= max) return label; }
  return "Low";
}

export const DraftPage = ({ settings }) => {
  const { players, loading, error, refresh, counts } = usePlayersCtx();
  const [myPickIds,  setMyPickIds]  = useState([]);
  const [allDrafted, setAllDrafted] = useState(new Set());
  const [pick,       setPick]       = useState(1);
  const [posFilter,  setPosFilter]  = useState("ALL");
  const [search,     setSearch]     = useState("");
  const [modal,      setModal]      = useState(null);
  const [showSync,   setShowSync]   = useState(false);

  const totalRoster = Object.values(settings.slots).reduce((a, b) => a + b, 0);
  const myPickNums  = useMemo(() => {
    const picks = []; const mySpot = 1;
    for (let r = 0; r < totalRoster; r++)
      picks.push(r % 2 === 0 ? r * settings.teams + mySpot : (r + 1) * settings.teams - (mySpot - 1));
    return picks;
  }, [settings, totalRoster]);

  const isMyPick    = myPickNums.includes(pick);
  const myPosCounts = useMemo(() => {
    const counts = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 };
    myPickIds.forEach(id => { const p = players.find(x => x.id === id); if (p) counts[p.pos] = (counts[p.pos] || 0) + 1; });
    return counts;
  }, [myPickIds, players]);

  // ── available must be declared before any useMemo that uses it ───────────
  const available = players.filter(p => !allDrafted.has(p.id));

  // ── BEST AVAILABLE ENGINE ──────────────────────────────────────────────────
  // Pure talent/value score — zero roster context. Factors:
  //   1. Overall rank (primary signal — biggest weight)
  //   2. ADP vs rank gap: ADP later than rank = undervalued by community (+bonus)
  //      Uses (p.overallRank - p.adp): positive when rank is WORSE than ADP
  //      i.e. the community is drafting them LATER than their rank deserves.
  //      This is directionally consistent with the Sleeper/Value engines.
  //   3. Injury risk (hard penalise OUT/IR)
  //   4. Tier (Elite players get a bonus to push them above mid-tier)
  //   5. Projection (PPG)
  const bestAvailable = useMemo(() => {
    const TIER_BONUS = { Elite: 40, "Tier 1": 20, "Tier 2": 8, "Tier 3": 2, Late: 0 };
    const candidates = [...available].filter(p => p.injury !== "OUT" && p.injury !== "IR");

    let best = null, bestScore = -Infinity;
    for (const p of candidates) {
      const rankScore  = p.overallRank ? Math.max(0, 200 - p.overallRank) : 0;
      // adpValue: positive when rank > ADP (undervalued — community drafts later than rank warrants)
      //           zero or negative when rank <= ADP (fairly or over-valued)
      // Capped at 60 to prevent a single term from dominating.
      const adpValue   = (p.adp && p.overallRank && p.adpSource !== "derived")
        ? Math.min(60, Math.max(0, p.overallRank - p.adp) * 1.5)
        : 0;
      const injPenalty = p.injury === "Q" ? -15 : 0;
      const tier       = getTierLabel(p.pos, p.posRank);
      const tierBonus  = TIER_BONUS[tier] || 0;
      const projScore  = p.ppg * 2;
      const total      = rankScore + adpValue + injPenalty + tierBonus + projScore;
      if (total > bestScore) { bestScore = total; best = { player: p, _score: total }; }
    }
    if (!best) return null;

    const p   = best.player;
    // adpSurplus: positive when ADP is later than rank (undervalued by community)
    const adpSurplus = (p.adp && p.overallRank && p.adpSource !== "derived")
      ? Math.round(p.adp - p.overallRank) : null;
    const tier = getTierLabel(p.pos, p.posRank);
    const reason =
      tier === "Elite" ? `${p.pos} elite tier — hardest to replace if passed on` :
      adpSurplus > 5   ? `ADP ${Math.round(p.adp)} vs rank #${p.overallRank} — community underrating by ${adpSurplus} picks` :
      p.overallRank <= 12 ? `Top-${p.overallRank} overall — franchise talent` :
      `Highest remaining value at pick ${pick}`;

    return { player: p, reason, explanation: generateDraftExplanation(p, { pick, myPosCounts, settings, available, cardType: "bestAvailable" }) };
  }, [available, pick]);

  // ── BEST FOR YOUR TEAM ENGINE ──────────────────────────────────────────────
  // Roster-construction score — pure context. Factors:
  //   1. Positional need: how far below target slot counts are we?
  //   2. Scarcity pressure: how fast are good players at this position disappearing?
  //   3. Bye week concentration: avoid stacking too many players on the same bye
  //   4. Starting lineup impact: a 2nd starter > a 3rd bench player
  //   5. Superflex QB premium
  const bestForTeam = useMemo(() => {
    const SCARCITY_PRESSURE = { Elite: 4, High: 3, Medium: 2, Low: 1 };
    const NEED_GRADE = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "D", "F"];

    // How many more starters do we need at each position?
    const startingNeed = (pos) => {
      const have    = myPosCounts[pos] || 0;
      const slots   = settings.slots[pos] || 0;
      const flexContrib = ["RB","WR","TE"].includes(pos) ? (settings.slots.FLEX || 0) * 0.4 : 0;
      const sfContrib   = (pos === "QB" && settings.superflex) ? (settings.slots.SUPER_FLEX || 0) : 0;
      return Math.max(0, slots + flexContrib + sfContrib - have);
    };

    // Count how many of each bye week we have
    const byeCounts = {};
    myPickIds.forEach(id => {
      const p = players.find(x => x.id === id);
      if (p?.bye) byeCounts[p.bye] = (byeCounts[p.bye] || 0) + 1;
    });

    // Score each available player from a pure roster-need perspective
    let best = null, bestScore = -Infinity;
    let bestNeedScore = 0, bestFitPct = 0;

    for (const p of available) {
      if (p.injury === "OUT" || p.injury === "IR") continue;

      const need    = startingNeed(p.pos);
      const scPressure = SCARCITY_PRESSURE[getScarcityLabel(p.pos, p.posRank)] || 1;

      // Positional need × scarcity = urgency score (0–40)
      const urgency = Math.min(40, need * 10 * scPressure);

      // Starter impact: is this player good enough to start? (0–25)
      const starterBonus = p.posRank && p.posRank <= (settings.slots[p.pos] || 2) + (settings.slots.FLEX || 1) + 1
        ? 25 : p.posRank && p.posRank <= 8 ? 12 : 0;

      // Superflex QB bonus
      const sfBonus = (settings.superflex && p.pos === "QB" && (myPosCounts.QB || 0) < 2) ? 18 : 0;

      // Bye week penalty: −8 if already have 2+ players on this bye
      const byePenalty = p.bye && (byeCounts[p.bye] || 0) >= 2 ? -8 : 0;

      // Injury caution
      const injPenalty = p.injury === "Q" ? -10 : 0;

      // PPG bonus (dampened vs bestAvailable — team engine cares less about raw talent)
      const ppgBonus = p.ppg * 0.5;

      const total = urgency + starterBonus + sfBonus + byePenalty + injPenalty + ppgBonus;

      if (total > bestScore) {
        bestScore = total;
        best = p;
        bestNeedScore = Math.min(9, Math.round((urgency / 40) * 9));
        bestFitPct    = Math.min(99, Math.round(50 + (need * scPressure * 8) + starterBonus / 2));
      }
    }

    if (!best) return null;

    // Compute "impact score" — how much does adding this player improve projected roster PPG?
    const currentRosterPPG = myPickIds.reduce((s, id) => {
      const p = players.find(x => x.id === id);
      return s + (p?.ppg || 0);
    }, 0) || 1;
    const impactPct = Math.round((best.ppg / currentRosterPPG) * 100);

    // Need grade: A+ → F
    const needGrade = NEED_GRADE[Math.max(0, 9 - bestNeedScore)] || "B";

    // Build an explanation that spells out the reasoning
    const posNeed    = startingNeed(best.pos);
    const scLabel    = getScarcityLabel(best.pos, best.posRank);
    const tier       = getTierLabel(best.pos, best.posRank);
    const reason =
      posNeed >= 2     ? `Your roster needs ${best.pos} starters. ${scLabel} scarcity at ${best.pos} — this tier disappears fast.` :
      posNeed >= 1     ? `You need a ${best.pos} starter. At ${best.pos}${best.posRank} with ${scLabel} scarcity, waiting costs you.` :
      scLabel === "Elite" || scLabel === "High"
                       ? `${best.pos} depth is running thin. Locking in ${tier} ${best.pos} now prevents a bidding war later.` :
      `Best roster-construction fit at pick ${pick} given your current team composition.`;

    return { player: best, reason, needGrade, fitScore: bestFitPct, impactScore: impactPct, explanation: generateDraftExplanation(best, { pick, myPosCounts, settings, available, cardType: "bestForTeam" }) };
  }, [available, myPosCounts, myPickIds, settings, pick, players]);

  // ── SLEEPER PICK ENGINE ────────────────────────────────────────────────────
  // Value play: player being drafted significantly later than their talent suggests.
  const sleeperPick = useMemo(() => {
    const candidates = [...available].filter(p =>
      !p.injury &&
      p.ppg > 8 &&
      p.overallRank &&
      p.adp &&
      p.adpSource !== "derived" &&
      // Being drafted 8+ picks later than their rank suggests
      (p.adp - p.overallRank) >= 8
    );
    if (!candidates.length) {
      // Fallback: trending up with late ADP
      return [...available]
        .filter(p => (p.adp == null || p.adp > 25) && p.trend === "up" && !p.injury && p.ppg > 8)
        .sort((a, b) => (b.opportunityScore || 0) - (a.opportunityScore || 0))[0] || null;
    }
    // Best sleeper: biggest gap between rank and ADP
    return candidates.sort((a, b) => (b.adp - b.overallRank) - (a.adp - a.overallRank))[0];
  }, [available]);

  // ── 🔥 VALUE PICK ENGINE ──────────────────────────────────────────────────
  // Player whose ADP is meaningfully later than their overall rank suggests.
  // Must have real FC-sourced ADP (not derived) and a genuine gap.
  // Min threshold: 10 picks of value. Excludes injured players.
  const valuePick = useMemo(() => {
    const MIN_VALUE = 10; // picks of surplus value required
    const candidates = available.filter(p =>
      p.overallRank &&
      p.adp &&
      p.adpSource === "fantasycalc_rank" &&
      !["OUT","IR"].includes(p.injury) &&
      (p.adp - p.overallRank) >= MIN_VALUE
    );
    if (!candidates.length) return null;

    // Best value: largest gap between rank and ADP, tiebreak by rank
    const best = candidates.sort((a, b) => {
      const aGap = (a.adp - a.overallRank);
      const bGap = (b.adp - b.overallRank);
      if (bGap !== aGap) return bGap - aGap;
      return (a.overallRank || 999) - (b.overallRank || 999);
    })[0];

    const value = Math.round(best.adp - best.overallRank);
    const explanation =
      value >= 25 ? `Massive draft day value — being passed over despite elite rank. Don't let this one slip past.` :
      value >= 15 ? `Draft community is sleeping on this player. Rank vs ADP gap suggests significant upside at current pick.` :
      `Solid value — projected to produce above where managers are currently selecting them.`;

    return { player: best, adp: Math.round(best.adp), rank: best.overallRank, value, explanation };
  }, [available]);

  // ── 🚀 SLEEPER ALERT ENGINE ───────────────────────────────────────────────
  // Rising-opportunity player with high upside being taken well after their talent warrants.
  // Different from VALUE PICK: focuses on opportunity/upside momentum rather than pure rank gap.
  const sleeperAlert = useMemo(() => {
    const candidates = available.filter(p =>
      !["OUT","IR"].includes(p.injury) &&
      p.ppg > 5 &&
      p.adp &&
      p.adp > 40 && // must be a genuine late-round/mid-round player
      (p.trend === "up" || (p.opportunityScore || 0) >= 55 || (p.adpTrend === "rising"))
    );
    if (!candidates.length) return null;

    // Score: opportunity + upside momentum + ADP lateness (deeper = bigger sleeper potential)
    const best = candidates.sort((a, b) => {
      const aScore = (a.opportunityScore || 40) * 0.4
        + (a.boomPct || 15) * 0.3
        + (a.trend === "up" ? 20 : 0)
        + (a.adpTrend === "rising" ? 15 : 0)
        + Math.min(30, (a.adp || 60) * 0.3); // later ADP = bigger potential sleeper
      const bScore = (b.opportunityScore || 40) * 0.4
        + (b.boomPct || 15) * 0.3
        + (b.trend === "up" ? 20 : 0)
        + (b.adpTrend === "rising" ? 15 : 0)
        + Math.min(30, (b.adp || 60) * 0.3);
      return bScore - aScore;
    })[0];

    const trendScore  = Math.round((best.opportunityScore || 40));
    const oppScore    = Math.round(best.opportunityScore || 40);
    const upsideScore = Math.round((best.boomPct || 15) * 1.5 + (best.trend === "up" ? 20 : 0));
    const clampedUpside = Math.min(99, Math.max(0, upsideScore));

    const explanation =
      best.trend === "up" && (best.opportunityScore || 0) >= 60
        ? `Rising opportunity and trending upward — early signs of a breakout. ADP hasn't caught up to usage yet.`
      : best.adpTrend === "rising"
        ? `ADP is climbing fast. Window to grab this player at value is closing — act before managers catch on.`
      : (best.opportunityScore || 0) >= 65
        ? `High opportunity score despite late ADP — role expanding, projections may be underselling ceiling.`
      : `Strong upside metrics relative to draft cost. Potential high-upside bench add with breakout potential.`;

    return { player: best, trendScore, oppScore, upsideScore: clampedUpside, explanation };
  }, [available]);

  // ── ⚠ REACH WARNING ENGINE ───────────────────────────────────────────────
  // Scans players being picked right around the current pick who are overdrafted
  // relative to their rank. Looks at players just drafted (last 3 picks) for context,
  // and also flags if the top-5 available players by ADP has a big reach risk.
  // Min threshold: 12 picks earlier than ADP.
  const reachWarning = useMemo(() => {
    if (!available.length) return null;
    const MIN_REACH = 12;

    // Top players by ADP who are still available — most likely to be drafted soon
    const topByAdp = [...available]
      .filter(p => p.adp && p.adpSource === "fantasycalc_rank" && p.overallRank)
      .sort((a, b) => (a.adp ?? 999) - (b.adp ?? 999))
      .slice(0, 12);

    // Find the biggest reach among top-available players vs current pick
    // reach = overallRank - pick (positive = ranked lower than current pick = reach)
    const reaches = topByAdp
      .filter(p => (p.overallRank - pick) >= MIN_REACH)
      .map(p => ({ ...p, reachFactor: Math.round(p.overallRank - pick) }))
      .sort((a, b) => b.reachFactor - a.reachFactor);

    if (!reaches.length) return null;
    const worst = reaches[0];

    const explanation =
      worst.reachFactor >= 30
        ? `Significantly overdrafted relative to rankings. Equivalent value available ${worst.reachFactor} picks later — patience pays off here.`
      : worst.reachFactor >= 20
        ? `Managers are reaching hard for this player. Rankings suggest better value exists at this draft slot.`
      : `Mild reach. Player has name recognition but rankings don't fully support the draft cost yet.`;

    return {
      player: worst,
      adp: Math.round(worst.adp),
      currentPick: pick,
      reachFactor: worst.reachFactor,
      explanation,
    };
  }, [available, pick]);

  const filtered     = available.filter(p => posFilter === "ALL" || p.pos === posFilter).filter(p => p.name.toLowerCase().includes(search.toLowerCase())).sort((a, b) => (a.adp ?? 999) - (b.adp ?? 999));

  const draft = (id, mine) => {
    setAllDrafted(prev => new Set([...prev, id]));
    if (mine) setMyPickIds(prev => [...prev, id]);
    setPick(p => p + 1);
  };

  const handleSleeperSync = picks => {
    const ids    = new Set();
    const misses = [];
    picks.forEach(pick => {
      const match = players.find(p =>
        (pick.sleeperPlayerId && String(p.sleeperPlayerId) === String(pick.sleeperPlayerId)) ||
        (pick.playerName && p.name.toLowerCase().startsWith((pick.playerName || "").toLowerCase().slice(0, 8)))
      );
      if (match) ids.add(match.id);
      else       misses.push(pick.playerName || pick.sleeperPlayerId);
    });

    // Stage 4 logging for Draft Sync
    console.info(`[DraftPage] SleeperSync: ${ids.size}/${picks.length} picks resolved`);
    if (misses.length) {
      console.warn(`[DraftPage] Unresolved picks: [${misses.slice(0,5).join(', ')}]`);
      const sampleIds = players.slice(0,3).map(p => `${p.id}(${p.sleeperPlayerId})`);
      console.warn(`[DraftPage] Sample pool IDs: [${sampleIds.join(', ')}]`);
    }

    setAllDrafted(ids);
    setPick(picks.length + 1);
  };

  return (
    <div>
      <PlayerModal player={modal} onClose={() => setModal(null)} />
      <DataStatusBanner source="live" loading={loading} error={error} playerCount={players.length} counts={counts} refresh={refresh} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: C.text, margin: 0, letterSpacing: -0.5 }}>Live Draft Assistant</h1>
          <p style={{ color: C.muted, fontSize: 12, margin: "4px 0 0" }}>
            Pick <span style={{ color: isMyPick ? C.accent : C.text, fontWeight: 700 }}>#{pick}</span>
            {isMyPick && <span style={{ color: C.accent, fontWeight: 700 }}> — YOUR PICK ⬆</span>}
            {" "}· {settings.teams} teams · {settings.scoring}{settings.superflex ? " · SF" : ""} · {myPickIds.length} on my team · {allDrafted.size} off board
          </p>
        </div>
        <button onClick={() => setShowSync(v => !v)} style={{ background: showSync ? "#22C55E20" : C.surface2, border: `1px solid ${showSync ? C.accent : C.border}`, borderRadius: 8, padding: "7px 14px", fontSize: 11, color: showSync ? C.accent : C.muted, cursor: "pointer", fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
          <SyncIcon c={showSync ? C.accent : C.muted} /> Live Sync
        </button>
      </div>
      {showSync && <SleeperSync onPicksUpdate={handleSleeperSync} />}

      {isMyPick && !loading && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: C.accent, letterSpacing: 1.5, fontFamily: "monospace", marginBottom: 10 }}>⚡ YOUR PICK — AI INTELLIGENCE ENGINE ANALYSIS</div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <RecCard label="BEST AVAILABLE"     rec={bestAvailable}  color={C.accent}  icon="🏆" onDraft={draft} onView={setModal} currentPick={pick} />
            <RecCard label="BEST FOR YOUR TEAM" rec={bestForTeam}    color={C.blue}    icon="🎯" onDraft={draft} onView={setModal} currentPick={pick} />
            {sleeperPick && <RecCard label="SLEEPER PICK" rec={{ player: sleeperPick, reason: `ADP ${sleeperPick.adp?.toFixed(0) ?? "?"} but ranked #${sleeperPick.overallRank ?? "?"} — drafters sleeping on this player`, explanation: generateDraftExplanation(sleeperPick, { pick, myPosCounts, settings, available, cardType: "sleeperPick" }) }} color={C.warning} icon="💎" onDraft={draft} onView={setModal} currentPick={pick} />}
          </div>
        </div>
      )}

      {/* ── DRAFT INTELLIGENCE ──────────────────────────────────────────── */}
      {!loading && (valuePick || sleeperAlert || reachWarning) && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: C.muted, letterSpacing: 1.5, fontFamily: "monospace", marginBottom: 10 }}>
            🧠 DRAFT INTELLIGENCE
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 12 }}>

            {/* 🔥 VALUE PICK */}
            {valuePick && (
              <div style={{ background: C.surface, borderRadius: 12, border: "1px solid #22C55E30", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 9, fontWeight: 800, color: C.accent, letterSpacing: 1.8, fontFamily: "monospace" }}>🔥 VALUE PICK</div>
                <div>
                  <div onClick={() => setModal(valuePick.player)} style={{ fontSize: 15, fontWeight: 900, color: C.text, marginBottom: 4, cursor: "pointer" }}>
                    {valuePick.player.name}
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{ fontSize: 9, fontFamily: "monospace", fontWeight: 700, color: "#22C55E", background: "#22C55E18", borderRadius: 3, padding: "2px 6px" }}>{valuePick.player.pos}{valuePick.player.posRank}</span>
                    <span style={{ fontSize: 10, color: C.muted, fontFamily: "monospace" }}>{valuePick.player.team}</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: 1, background: C.surface2, borderRadius: 7, padding: "8px 6px", textAlign: "center" }}>
                    <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 800, color: C.muted }}>{valuePick.adp}</div>
                    <div style={{ fontSize: 8, color: C.muted, letterSpacing: 1, marginTop: 2 }}>ADP</div>
                  </div>
                  <div style={{ flex: 1, background: C.surface2, borderRadius: 7, padding: "8px 6px", textAlign: "center" }}>
                    <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 800, color: C.text }}>{pick}</div>
                    <div style={{ fontSize: 8, color: C.muted, letterSpacing: 1, marginTop: 2 }}>CURRENT PICK</div>
                  </div>
                  <div style={{ flex: 1, background: "#22C55E18", border: "1px solid #22C55E40", borderRadius: 7, padding: "8px 6px", textAlign: "center" }}>
                    <div style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 900, color: "#22C55E" }}>+{valuePick.value}</div>
                    <div style={{ fontSize: 8, color: "#22C55E", letterSpacing: 1, marginTop: 2 }}>VALUE</div>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>{valuePick.explanation}</div>
                <button onClick={() => setModal(valuePick.player)}
                  style={{ background: "#22C55E18", border: "1px solid #22C55E40", borderRadius: 7, padding: "6px", fontSize: 11, color: C.accent, cursor: "pointer", fontWeight: 600 }}>
                  View Player →
                </button>
              </div>
            )}

            {/* 🚀 SLEEPER ALERT */}
            {sleeperAlert && (
              <div style={{ background: C.surface, borderRadius: 12, border: "1px solid #A855F730", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 9, fontWeight: 800, color: "#A855F7", letterSpacing: 1.8, fontFamily: "monospace" }}>🚀 SLEEPER ALERT</div>
                <div>
                  <div onClick={() => setModal(sleeperAlert.player)} style={{ fontSize: 15, fontWeight: 900, color: C.text, marginBottom: 4, cursor: "pointer" }}>
                    {sleeperAlert.player.name}
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{ fontSize: 9, fontFamily: "monospace", fontWeight: 700, color: "#A855F7", background: "#A855F718", borderRadius: 3, padding: "2px 6px" }}>{sleeperAlert.player.pos}{sleeperAlert.player.posRank}</span>
                    <span style={{ fontSize: 10, color: C.muted, fontFamily: "monospace" }}>{sleeperAlert.player.team}</span>
                    {sleeperAlert.player.adpTrend === "rising" && <span style={{ fontSize: 9, color: C.accent, fontFamily: "monospace" }}>▲ Rising ADP</span>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {[
                    { label: "TREND",       val: sleeperAlert.trendScore,  col: sleeperAlert.trendScore  >= 60 ? "#22C55E" : C.muted },
                    { label: "OPPORTUNITY", val: sleeperAlert.oppScore,    col: sleeperAlert.oppScore    >= 60 ? "#3B82F6" : C.muted },
                    { label: "UPSIDE",      val: sleeperAlert.upsideScore, col: sleeperAlert.upsideScore >= 50 ? "#A855F7" : C.muted },
                  ].map(s => (
                    <div key={s.label} style={{ flex: 1, background: C.surface2, borderRadius: 7, padding: "8px 4px", textAlign: "center" }}>
                      <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 800, color: s.col }}>{s.val}</div>
                      <div style={{ fontSize: 7, color: C.muted, letterSpacing: 0.8, marginTop: 2 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>{sleeperAlert.explanation}</div>
                <button onClick={() => setModal(sleeperAlert.player)}
                  style={{ background: "#A855F718", border: "1px solid #A855F740", borderRadius: 7, padding: "6px", fontSize: 11, color: "#A855F7", cursor: "pointer", fontWeight: 600 }}>
                  View Player →
                </button>
              </div>
            )}

            {/* ⚠ REACH WARNING */}
            {reachWarning && (
              <div style={{ background: C.surface, borderRadius: 12, border: "1px solid #EF444430", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 9, fontWeight: 800, color: C.danger, letterSpacing: 1.8, fontFamily: "monospace" }}>⚠ REACH WARNING</div>
                <div>
                  <div onClick={() => setModal(reachWarning.player)} style={{ fontSize: 15, fontWeight: 900, color: C.text, marginBottom: 4, cursor: "pointer" }}>
                    {reachWarning.player.name}
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{ fontSize: 9, fontFamily: "monospace", fontWeight: 700, color: C.danger, background: "#EF444418", borderRadius: 3, padding: "2px 6px" }}>{reachWarning.player.pos}{reachWarning.player.posRank}</span>
                    <span style={{ fontSize: 10, color: C.muted, fontFamily: "monospace" }}>{reachWarning.player.team}</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: 1, background: C.surface2, borderRadius: 7, padding: "8px 6px", textAlign: "center" }}>
                    <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 800, color: C.muted }}>{reachWarning.adp}</div>
                    <div style={{ fontSize: 8, color: C.muted, letterSpacing: 1, marginTop: 2 }}>ADP</div>
                  </div>
                  <div style={{ flex: 1, background: C.surface2, borderRadius: 7, padding: "8px 6px", textAlign: "center" }}>
                    <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 800, color: C.text }}>{reachWarning.currentPick}</div>
                    <div style={{ fontSize: 8, color: C.muted, letterSpacing: 1, marginTop: 2 }}>CURRENT PICK</div>
                  </div>
                  <div style={{ flex: 1, background: "#EF444418", border: "1px solid #EF444440", borderRadius: 7, padding: "8px 6px", textAlign: "center" }}>
                    <div style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 900, color: C.danger }}>{reachWarning.reachFactor}</div>
                    <div style={{ fontSize: 8, color: C.danger, letterSpacing: 1, marginTop: 2 }}>REACH</div>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>{reachWarning.explanation}</div>
                <button onClick={() => setModal(reachWarning.player)}
                  style={{ background: "#EF444418", border: "1px solid #EF444440", borderRadius: 7, padding: "6px", fontSize: 11, color: C.danger, cursor: "pointer", fontWeight: 600 }}>
                  View Player →
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {myPickIds.length > 0 && (
        <div style={{ marginBottom: 14, background: C.surface, borderRadius: 10, border: `1px solid ${C.border}`, padding: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: C.muted, letterSpacing: 1.5, fontFamily: "monospace", marginBottom: 10 }}>MY TEAM — {myPickIds.length} PLAYERS</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {myPickIds.map(id => { const p = players.find(x => x.id === id); if (!p) return null; return (
              <div key={id} onClick={() => setModal(p)} style={{ background: C.surface2, borderRadius: 7, border: `1px solid ${C.border}`, padding: "6px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
                onMouseEnter={e => e.currentTarget.style.borderColor = C.accent + "60"} onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
                <PosBadge pos={p.pos} />
                <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{p.name}</span>
                <span style={{ fontFamily: "monospace", fontSize: 11, color: C.accent }}>{p.ppg}</span>
                <InjuryBadge status={p.injury} />
              </div>
            ); })}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search players…" style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 12px", color: C.text, fontSize: 13, outline: "none", flex: "1 1 160px", minWidth: 0 }} />
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {["ALL","QB","RB","WR","TE","K","DST"].map(pos => (
            <button key={pos} onClick={() => setPosFilter(pos)} style={{ background: posFilter === pos ? posColor(pos) + "22" : C.surface2, border: `1px solid ${posFilter === pos ? posColor(pos) : C.border}`, color: posFilter === pos ? posColor(pos) : C.muted, borderRadius: 6, padding: "5px 9px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "monospace" }}>{pos}</button>
          ))}
        </div>
        <button onClick={() => { setAllDrafted(new Set()); setMyPickIds([]); setPick(1); }} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 6, padding: "5px 12px", fontSize: 11, color: C.muted, cursor: "pointer" }}>↺ Reset</button>
      </div>

      {loading ? (
        <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20 }}>
          {Array.from({ length: 10 }).map((_, i) => <div key={i} style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "center" }}><Skeleton h={10} w={30} /><Skeleton h={10} w={160} /><Skeleton h={10} w={40} /><Skeleton h={10} w={50} /></div>)}
        </div>
      ) : (
        <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {["ADP","PLAYER","POS","PPG","WK","OPP","CONF","▲▼","STATUS",""].map(h => (
                  <th key={h} style={{ padding: "10px 10px", textAlign: "left", fontSize: 10, fontFamily: "monospace", fontWeight: 700, color: C.muted, letterSpacing: 1.5, background: C.surface, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 100).map((p, i) => {
                const gc     = gradeColor(p.matchup?.grade);
                const isBO   = p.id === bestAvailable?.player?.id;
                const isBT   = p.id === bestForTeam?.player?.id;
                const isSL   = p.id === sleeperPick?.id;
                const recCol = p.aiRecommendation?.confidence >= 75 ? C.accent : p.aiRecommendation?.confidence >= 55 ? C.blue : p.aiRecommendation?.confidence >= 40 ? C.warning : C.danger;
                return (
                  <tr key={p.id} onClick={() => setModal(p)} style={{ borderBottom: `1px solid ${C.border}`, background: (isBO || isBT || isSL) ? "#22C55E07" : i % 2 === 0 ? "transparent" : "#ffffff02", cursor: "pointer" }}
                    onMouseEnter={e => e.currentTarget.style.background = "#22C55E0d"}
                    onMouseLeave={e => e.currentTarget.style.background = (isBO || isBT || isSL) ? "#22C55E07" : i % 2 === 0 ? "transparent" : "#ffffff02"}>
                    <td style={{ padding: "10px 10px", fontFamily: "monospace", fontSize: 11, color: C.muted, whiteSpace: "nowrap" }}>
                      {p.adp != null ? p.adp.toFixed(1) : "—"}
                      {p.adpTrend === "rising"  && <span style={{ color: C.accent, marginLeft: 3, fontSize: 9 }}>▲</span>}
                      {p.adpTrend === "falling" && <span style={{ color: C.danger, marginLeft: 3, fontSize: 9 }}>▼</span>}
                      {p.adpSource === "estimated" && <span style={{ color: C.muted, marginLeft: 2, fontSize: 8, opacity: 0.6 }}>~</span>}
                    </td>
                    <td style={{ padding: "10px 10px", fontSize: 13, fontWeight: 700, color: C.text, whiteSpace: "nowrap" }}>
                      {isBO && <span style={{ marginRight: 4, color: C.accent }}>🏆</span>}
                      {isBT && !isBO && <span style={{ marginRight: 4, color: C.blue }}>🎯</span>}
                      {isSL && <span style={{ marginRight: 4 }}>💎</span>}
                      {p.name}
                    </td>
                    <td style={{ padding: "10px 10px" }}><PosBadge pos={p.pos} /></td>
                    <td style={{ padding: "10px 10px", fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: C.accent }}>{p.ppg}</td>
                    <td style={{ padding: "10px 10px" }}>{p.matchup && <span style={{ fontSize: 11, fontWeight: 800, color: gc, fontFamily: "monospace" }}>{p.matchup.grade}</span>}</td>
                    <td style={{ padding: "10px 10px", fontSize: 10, fontFamily: "monospace", color: C.muted }}>{p.matchup?.opp || "—"}</td>
                    <td style={{ padding: "10px 10px" }}>
                      {p.aiRecommendation && <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <div style={{ width: 36, height: 4, background: C.border, borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${p.aiRecommendation.confidence}%`, background: recCol, borderRadius: 2 }} />
                        </div>
                        <span style={{ fontSize: 10, fontFamily: "monospace", color: recCol, fontWeight: 700 }}>{p.aiRecommendation.confidence}%</span>
                      </div>}
                    </td>
                    <td style={{ padding: "10px 10px" }}><TrendIcon trend={p.trend} /></td>
                    <td style={{ padding: "10px 10px" }}><InjuryBadge status={p.injury} /></td>
                    <td style={{ padding: "10px 10px" }}>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button onClick={e => { e.stopPropagation(); draft(p.id, true); }} style={{ background: "#22C55E20", border: "1px solid #22C55E50", borderRadius: 5, padding: "2px 7px", fontSize: 10, color: C.accent, cursor: "pointer", fontWeight: 700, whiteSpace: "nowrap" }}>Mine</button>
                        <button onClick={e => { e.stopPropagation(); draft(p.id, false); }} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 5, padding: "2px 7px", fontSize: 10, color: C.muted, cursor: "pointer", whiteSpace: "nowrap" }}>Theirs</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
