"use client";
import { useState, useMemo } from "react";
import { C, gradeColor } from "@/lib/theme";
import { usePlayersCtx } from "@/hooks/usePlayersContext";
import { InjuryBadge, PosBadge, Skeleton } from "@/components/ui/Badges";
import { DataStatusBanner } from "@/components/ui/DataStatusBanner";
import { PlayerModal } from "@/components/player/PlayerModal";

export const TeamPage = ({ setPage }) => {
  const { players, loading, error, refresh, myRosterIds, counts, rosters, myTeamId } = usePlayersCtx();
  const [modal, setModal] = useState(null);

  const roster = useMemo(() => {
    if (!players.length || !myRosterIds.length) return [];

    // ── Stage 4: player pool → roster resolution ───────────────────────────
    const resolved   = [];
    const misses     = [];
    myRosterIds.forEach(id => {
      const match = players.find(p =>
        String(p.id) === String(id) || String(p.sleeperPlayerId) === String(id)
      );
      if (match) resolved.push(match);
      else       misses.push(id);
    });

    if (misses.length) {
      console.warn(`[TeamPage] Stage 4 — ${misses.length}/${myRosterIds.length} roster IDs did not resolve to a player. Missing IDs: [${misses.slice(0,5).join(', ')}${misses.length > 5 ? '…' : ''}]`);
      // Spot-check: show what IDs ARE in the player pool so we can compare
      const samplePoolIds = players.slice(0, 5).map(p => `${p.id}/${p.sleeperPlayerId}`);
      console.warn(`[TeamPage]   Sample pool IDs (id/sleeperPlayerId): [${samplePoolIds.join(', ')}]`);
    } else {
      console.info(`[TeamPage] ✓ Stage 4 — All ${resolved.length} roster players resolved`);
    }

    return resolved;
  }, [players, myRosterIds]);
  const byPos   = useMemo(() =>
    roster.reduce((acc, p) => { (acc[p.pos] = acc[p.pos] || []).push(p); return acc; }, {}),
    [roster]
  );

  // ── Real league-relative standings (computed from the actual rosters) ──────
  const playerIndex = useMemo(() => {
    const m = new Map();
    players.forEach(p => { m.set(String(p.id), p); if (p.sleeperPlayerId) m.set(String(p.sleeperPlayerId), p); });
    return m;
  }, [players]);
  const resolveRoster  = ids => (ids || []).map(id => playerIndex.get(String(id))).filter(Boolean);
  // Roster strength = top-9 starters' PPG (excl. IR/OUT) — a consistent basis
  // for comparing every team in the league.
  const rosterStrength = ids => resolveRoster(ids)
    .filter(p => !["IR", "OUT"].includes(p.injury || ""))
    .sort((a, b) => b.ppg - a.ppg).slice(0, 9)
    .reduce((s, p) => s + p.ppg, 0);

  const totalPPG = rosterStrength(myRosterIds);

  const leagueStrengths = useMemo(() =>
    (rosters || [])
      .map(r => ({ teamId: String(r.teamId), strength: rosterStrength(r.playerIds) }))
      .sort((a, b) => b.strength - a.strength),
    [rosters, playerIndex]   // eslint-disable-line react-hooks/exhaustive-deps
  );
  const totalTeams     = leagueStrengths.length;
  const myStrengthRank = totalTeams ? leagueStrengths.findIndex(r => r.teamId === String(myTeamId)) + 1 : 0;
  const leagueAvgPPG   = totalTeams ? Math.round(leagueStrengths.reduce((s, r) => s + r.strength, 0) / totalTeams) : 0;
  const myRecord       = (rosters || []).find(r => String(r.teamId) === String(myTeamId))?.record || null;
  const seasonStarted  = myRecord ? (myRecord.wins + myRecord.losses) > 0 : false;

  const posAvgPPG = pos => {
    const pl = (byPos[pos] || []).filter(p => p.injury !== "IR");
    return pl.length ? pl.reduce((s, p) => s + p.ppg, 0) / pl.length : 0;
  };
  const posGrades = [
    { pos: "QB",  avg: posAvgPPG("QB"),  threshold: 25 },
    { pos: "RB",  avg: posAvgPPG("RB"),  threshold: 18 },
    { pos: "WR",  avg: posAvgPPG("WR"),  threshold: 16 },
    { pos: "TE",  avg: posAvgPPG("TE"),  threshold: 12 },
    { pos: "K",   avg: posAvgPPG("K"),   threshold:  7 },
    { pos: "DST", avg: posAvgPPG("DST"), threshold:  7 },
  ].map(p => ({
    ...p,
    grade: p.avg >= p.threshold * 1.2 ? "A" : p.avg >= p.threshold ? "B" : p.avg >= p.threshold * 0.75 ? "C" : "D",
  }));

  const weakPositions = posGrades.filter(p => p.grade === "C" || p.grade === "D");
  const injuryRisk    = roster.filter(p => p.injury);

  // Which players are rostered by OTHER teams (→ trade) vs unrostered (→ waiver add).
  const rosteredElsewhere = useMemo(() => {
    const set = new Set();
    (rosters || []).forEach(r => {
      if (String(r.teamId) === String(myTeamId)) return;
      (r.playerIds || []).forEach(id => set.add(String(id)));
    });
    return set;
  }, [rosters, myTeamId]);
  const onMyRoster = id => myRosterIds.some(x => String(x) === String(id));

  const upgradeTargets = useMemo(() =>
    weakPositions.flatMap(wp =>
      players
        .filter(p => p.pos === wp.pos && !onMyRoster(p.id) && !onMyRoster(p.sleeperPlayerId) && p.injury !== "OUT" && p.injury !== "IR" && (p.aiRecommendation?.confidence || 0) >= 60)
        .sort((a, b) => (b.aiRecommendation?.confidence || 0) - (a.aiRecommendation?.confidence || 0))
        .slice(0, 2)
        .map(p => ({
          ...p,
          // Only classify when we actually have league rosters loaded.
          source: !rosters?.length ? null
            : (rosteredElsewhere.has(String(p.sleeperPlayerId)) || rosteredElsewhere.has(String(p.id))) ? "trade" : "waiver",
        }))
    ).slice(0, 4),
    [weakPositions, players, myRosterIds, rosteredElsewhere, rosters]   // eslint-disable-line react-hooks/exhaustive-deps
  );

  const gc2 = g => ({ A: C.accent, B: C.blue, C: C.warning, D: C.danger }[g] || C.muted);

  return (
    <div>
      <PlayerModal player={modal} onClose={() => setModal(null)} />
      <DataStatusBanner source="live" loading={loading} error={error} playerCount={players.length} counts={counts} refresh={refresh} />
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: C.text, margin: 0, letterSpacing: -0.5 }}>Team Review</h1>
        <p style={{ color: C.muted, fontSize: 12, margin: "4px 0 0" }}>Full roster analysis · Roster strength vs your league · Trade &amp; waiver upgrade targets</p>
      </div>

      {!loading && roster.length === 0 && (
        <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, padding: 28, textAlign: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 6 }}>No roster connected</div>
          <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
            Go to <strong style={{ color: C.accent }}>Trades → Trade Finder</strong> and connect your Sleeper league to import your roster.
          </div>
        </div>
      )}

      {/* Summary stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginBottom: 16 }}>
        {[
          {
            label: "RECORD",
            val:   seasonStarted ? `${myRecord.wins}-${myRecord.losses}` : "Preseason",
            sub:   seasonStarted ? `${Math.round(myRecord.pf)} PF · ${Math.round(myRecord.pa)} PA` : (totalTeams ? "Season not started" : "Connect a league"),
            color: !seasonStarted ? C.muted : myRecord.wins > myRecord.losses ? C.accent : myRecord.wins < myRecord.losses ? C.danger : C.warning,
          },
          {
            label: "ROSTER RANK",
            val:   totalTeams ? `#${myStrengthRank}/${totalTeams}` : "—",
            sub:   totalTeams ? `Stronger than ${totalTeams - myStrengthRank} of ${totalTeams - 1} rivals` : "Connect a league",
            color: !totalTeams ? C.muted : myStrengthRank <= totalTeams / 3 ? C.accent : myStrengthRank <= (2 * totalTeams) / 3 ? C.warning : C.danger,
          },
          {
            label: "ROSTER PPG",
            val:   totalPPG.toFixed(1),
            sub:   totalTeams ? `League avg ${leagueAvgPPG}` : "Top-9 starters",
            color: !totalTeams ? C.text : totalPPG >= leagueAvgPPG ? C.accent : C.warning,
          },
          { label: "INJURY RISKS", val: injuryRisk.length, sub: injuryRisk.length ? injuryRisk.map(p => p.name).join(", ") : "All healthy", color: injuryRisk.length ? C.danger : C.accent },
        ].map(s => (
          <div key={s.label} style={{ background: C.surface, borderRadius: 10, border: `1px solid ${C.border}`, padding: 14 }}>
            <div style={{ fontSize: 9, color: C.muted, fontFamily: "monospace", letterSpacing: 1.5, marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 900, color: s.color, marginBottom: 4 }}>{s.val}</div>
            <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.4 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Position grades */}
      <div style={{ marginBottom: 16, background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, padding: 16 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: C.muted, letterSpacing: 1.5, fontFamily: "monospace", marginBottom: 12 }}>POSITION GRADES</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
          {posGrades.map(pg => (
            <div key={pg.pos} style={{ textAlign: "center", padding: 12, background: C.surface2, borderRadius: 8, border: `1px solid ${gc2(pg.grade)}30` }}>
              <div style={{ fontFamily: "monospace", fontSize: 28, fontWeight: 900, color: gc2(pg.grade) }}>{pg.grade}</div>
              <div style={{ fontSize: 11, color: C.muted, fontFamily: "monospace", marginBottom: 4 }}>{pg.pos}</div>
              <div style={{ fontSize: 10, color: gc2(pg.grade), fontFamily: "monospace", fontWeight: 700 }}>{pg.avg.toFixed(1)} PPG</div>
              {weakPositions.find(w => w.pos === pg.pos) && (
                <div style={{ fontSize: 9, color: C.warning, marginTop: 4 }}>Needs upgrade</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Roster list */}
      {loading ? (
        <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, padding: 16 }}>
          {Array.from({ length: 8 }).map((_, i) => <div key={i} style={{ display: "flex", gap: 10, marginBottom: 12 }}><Skeleton h={12} w={40} /><Skeleton h={12} w={160} /><Skeleton h={12} w={50} /></div>)}
        </div>
      ) : (
        <div style={{ marginBottom: 16, background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden" }}>
          <div style={{ padding: "11px 14px", borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: C.muted, fontFamily: "monospace", letterSpacing: 1.5 }}>FULL ROSTER — {roster.length} PLAYERS</span>
          </div>
          {roster.map(p => {
            const gc  = gradeColor(p.matchup?.grade);
            const rec = p.aiRecommendation;
            return (
              <div key={p.id} onClick={() => setModal(p)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}
                onMouseEnter={e => e.currentTarget.style.background = "#22C55E09"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <PosBadge pos={p.pos} />
                <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: C.text, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                <span style={{ fontFamily: "monospace", fontSize: 10, color: C.muted, flexShrink: 0 }}>{p.team}</span>
                <span style={{ fontFamily: "monospace", fontSize: 12, color: C.accent, fontWeight: 700, flexShrink: 0 }}>{p.ppg}</span>
                {p.matchup && <span style={{ fontSize: 10, fontWeight: 800, color: gc, fontFamily: "monospace", flexShrink: 0 }}>{p.matchup.grade}</span>}
                {rec && <span style={{ fontSize: 10, fontFamily: "monospace", color: rec.confidence >= 70 ? C.accent : C.muted, flexShrink: 0 }}>{rec.confidence}%</span>}
                <InjuryBadge status={p.injury} />
              </div>
            );
          })}
        </div>
      )}

      {/* Upgrade targets — trade vs free agent, at your weak positions */}
      {upgradeTargets.length > 0 && (
        <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: C.accent, fontFamily: "monospace", letterSpacing: 1.5 }}>🎯 UPGRADE TARGETS — FILL YOUR GAPS</span>
            <button onClick={() => setPage("trades")} style={{ background: C.accent + "20", border: `1px solid ${C.accent}50`, borderRadius: 6, padding: "4px 10px", fontSize: 10, color: C.accent, cursor: "pointer", fontWeight: 700 }}>Open Trade Finder →</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 10 }}>
            {upgradeTargets.map(p => {
              const srcCfg = p.source === "trade"  ? { label: "TRADE",      col: C.blue }
                           : p.source === "waiver" ? { label: "FREE AGENT", col: C.accent }
                           : null;
              return (
              <div key={p.id} onClick={() => setModal(p)} style={{ background: C.surface2, borderRadius: 8, border: `1px solid ${C.border}`, padding: 12, cursor: "pointer" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = C.accent + "50"} onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{p.name}</div>
                    <div style={{ display: "flex", gap: 5, marginTop: 3, alignItems: "center", flexWrap: "wrap" }}>
                      <PosBadge pos={p.pos} />
                      <span style={{ fontSize: 10, color: C.muted, fontFamily: "monospace" }}>{p.team}</span>
                      {srcCfg && <span style={{ fontSize: 8, fontWeight: 800, color: srcCfg.col, background: srcCfg.col + "20", border: `1px solid ${srcCfg.col}40`, borderRadius: 3, padding: "1px 5px", letterSpacing: 0.8, fontFamily: "monospace" }}>{srcCfg.label}</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 800, color: C.accent }}>{p.ppg}</div>
                    <div style={{ fontSize: 9, color: C.muted }}>PPG</div>
                  </div>
                </div>
                {p.aiRecommendation && (
                  <div style={{ fontSize: 10, color: C.muted, fontFamily: "monospace" }}>
                    <span style={{ color: C.accent, fontWeight: 700 }}>{p.aiRecommendation.confidence}% confidence</span> · {p.aiRecommendation.action}
                  </div>
                )}
              </div>
            );})}
          </div>
        </div>
      )}
    </div>
  );
};
