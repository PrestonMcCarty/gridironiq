"use client";
import { useState, useMemo } from "react";
import { C, gradeColor } from "@/lib/theme";
import { usePlayersCtx } from "@/hooks/usePlayersContext";
import { InjuryBadge, PosBadge, Skeleton } from "@/components/ui/Badges";
import { DataStatusBanner } from "@/components/ui/DataStatusBanner";
import { PlayerModal } from "@/components/player/PlayerModal";

export const LineupPage = ({ settings }) => {
  const { players, loading, error, refresh, myRosterIds, counts } = usePlayersCtx();
  const [modal, setModal] = useState(null);

  const roster = useMemo(() => {
    if (!players.length || !myRosterIds.length) return [];
    const resolved = [];
    const misses   = [];
    myRosterIds.forEach(id => {
      const match = players.find(p =>
        String(p.id) === String(id) || String(p.sleeperPlayerId) === String(id)
      );
      if (match) resolved.push(match);
      else       misses.push(id);
    });
    if (misses.length) {
      console.warn(`[LineupPage] Stage 4 — ${misses.length}/${myRosterIds.length} roster IDs unresolved: [${misses.slice(0,5).join(', ')}]`);
    } else {
      console.info(`[LineupPage] ✓ Stage 4 — All ${resolved.length} roster players resolved`);
    }
    return resolved;
  }, [players, myRosterIds]);

  const optimal = useMemo(() => {
    const score = p => {
      let s = p.ppg;
      if (p.injury === "OUT" || p.injury === "IR") return -999;
      if (p.injury === "D")   s -= 4;   // Doubtful — significant penalty
      if (p.injury === "Q")   s -= 1;   // Questionable — minor caution
      // REC / PUP: no lineup-score penalty (informational badge only)
      const gc = p.matchup?.grade;
      if (gc === "A") s += 5; if (gc === "B") s += 2; if (gc === "D") s -= 4;
      s += (p.opportunityScore || 50) * 0.05;
      s += (p.consistencyScore || 50) * 0.03;
      if (p.trend === "up") s += 2; if (p.trend === "down") s -= 1;
      return s;
    };
    const used = []; const lineup = [];
    const fill = (pos, count) => roster.filter(p => p.pos === pos && !used.includes(p.id)).sort((a, b) => score(b) - score(a)).slice(0, count).forEach(p => { used.push(p.id); lineup.push({ ...p, slot: pos, startSit: "START", scoreVal: score(p) }); });
    if (settings.superflex) { fill("QB", 2); } else { fill("QB", 1); }
    fill("RB",  settings.slots.RB  || 2);
    fill("WR",  settings.slots.WR  || 2);
    fill("TE",  settings.slots.TE  || 1);
    // FLEX: RB/WR/TE eligible
    roster.filter(p => ["RB","WR","TE"].includes(p.pos) && !used.includes(p.id))
      .sort((a, b) => score(b) - score(a))
      .slice(0, settings.slots.FLEX || 1)
      .forEach(p => { used.push(p.id); lineup.push({ ...p, slot: "FLEX",    startSit: "FLEX",  scoreVal: score(p) }); });
    // K and DST slots
    fill("K",   settings.slots.K   || 1);
    fill("DST", settings.slots.DST || 1);
    roster.filter(p => !used.includes(p.id)).forEach(p => lineup.push({ ...p, slot: "BN", startSit: "SIT", scoreVal: score(p) }));
    return lineup;
  }, [roster, settings]);

  const starters  = optimal.filter(p => p.slot !== "BN");
  const bench     = optimal.filter(p => p.slot === "BN");
  const projTotal = starters.reduce((s, p) => s + (p.scoreVal > 0 ? p.ppg : 0), 0).toFixed(1);
  const alerts    = optimal.filter(p => p.slot !== "BN" && ["Q","D","OUT","IR","REC","PUP"].includes(p.injury));
  const upgrades  = bench.filter(p => p.scoreVal > 0 && starters.some(s => s.pos === p.pos && s.scoreVal < p.scoreVal));

  const Row = ({ p }) => {
    const gc  = gradeColor(p.matchup?.grade);
    const rec = p.aiRecommendation;
    return (
      <div onClick={() => setModal(p)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 14px", borderBottom: `1px solid ${C.border}`, cursor: "pointer", opacity: p.slot === "BN" ? 0.72 : 1 }}
        onMouseEnter={e => e.currentTarget.style.background = "#22C55E09"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
        <span style={{ fontFamily: "monospace", fontSize: 10, color: C.muted, width: 34, fontWeight: 700, flexShrink: 0 }}>{p.slot}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.text, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
        <PosBadge pos={p.pos} />
        <span style={{ fontFamily: "monospace", fontSize: 10, color: C.muted, flexShrink: 0 }}>{p.team}</span>
        <span style={{ fontFamily: "monospace", fontSize: 12, color: C.accent, fontWeight: 700, flexShrink: 0 }}>{p.ppg}</span>
        {p.matchup && <span style={{ fontSize: 10, fontWeight: 800, color: gc, fontFamily: "monospace", flexShrink: 0 }}>{p.matchup.grade}</span>}
        {rec && rec.action !== "OFFSEASON" && <div style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
          <div style={{ width: 28, height: 3, background: C.border, borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${rec.confidence}%`, background: rec.confidence >= 70 ? C.accent : rec.confidence >= 50 ? C.blue : C.warning, borderRadius: 2 }} />
          </div>
          <span style={{ fontSize: 9, fontFamily: "monospace", color: C.muted }}>{rec.confidence}%</span>
        </div>}
        <InjuryBadge status={p.injury} />
        <span style={{ fontSize: 10, fontWeight: 800, fontFamily: "monospace", letterSpacing: 0.8, padding: "2px 7px", borderRadius: 4, flexShrink: 0,
          background: p.startSit === "START" ? "#22C55E20" : p.startSit === "FLEX" ? "#F59E0B20" : "#EF444420",
          color: p.startSit === "START" ? C.accent : p.startSit === "FLEX" ? C.warning : C.danger,
          border: `1px solid ${p.startSit === "START" ? C.accent : p.startSit === "FLEX" ? C.warning : C.danger}40` }}>{p.startSit}</span>
      </div>
    );
  };

  return (
    <div>
      <PlayerModal player={modal} onClose={() => setModal(null)} />
      <DataStatusBanner source="live" loading={loading} error={error} playerCount={players.length} counts={counts} refresh={refresh} />
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: C.text, margin: 0, letterSpacing: -0.5 }}>Best Lineup This Week</h1>
        <p style={{ color: C.muted, fontSize: 12, margin: "4px 0 0" }}>Intelligence-optimized · Proj: <span style={{ color: C.accent, fontWeight: 700 }}>{projTotal} pts</span> · Click any player for AI analysis</p>
      </div>
      {!loading && roster.length === 0 && (
        <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, padding: 28, textAlign: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 6 }}>No roster connected</div>
          <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
            Go to <strong style={{ color: C.accent }}>Trades → Trade Finder</strong> and connect your Sleeper league to import your roster.
          </div>
        </div>
      )}
      {alerts.length > 0 && (
        <div style={{ marginBottom: 14, padding: 14, background: "#EF444408", borderRadius: 10, border: "1px solid #EF444430" }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: C.danger, letterSpacing: 1.5, fontFamily: "monospace", marginBottom: 8 }}>⚠ INJURY ALERTS IN YOUR LINEUP</div>
          {alerts.map(p => <div key={p.id} style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}><span style={{ color: C.text, fontWeight: 700 }}>{p.name}</span> — {p.injuryDetail?.timeline || `Listed as ${p.injury}. Monitor before locking.`}</div>)}
        </div>
      )}
      {upgrades.length > 0 && (
        <div style={{ marginBottom: 14, padding: 14, background: "#3B82F608", borderRadius: 10, border: "1px solid #3B82F630" }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: C.blue, letterSpacing: 1.5, fontFamily: "monospace", marginBottom: 8 }}>💡 LINEUP UPGRADE SUGGESTIONS</div>
          {upgrades.map(p => <div key={p.id} style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>
            <span style={{ color: C.text, fontWeight: 700 }}>{p.name}</span> ({p.pos}, {p.ppg} PPG, {p.aiRecommendation?.confidence || 0}% confidence) has a <span style={{ color: gradeColor(p.matchup?.grade), fontWeight: 700 }}>{p.matchup?.grade} matchup</span> vs {p.matchup?.opp || "?"} — consider starting over a lower-confidence starter.
          </div>)}
        </div>
      )}
      {loading ? (
        <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20 }}>
          {Array.from({ length: 8 }).map((_, i) => <div key={i} style={{ display: "flex", gap: 10, marginBottom: 14 }}><Skeleton h={12} w={40} /><Skeleton h={12} w={180} /><Skeleton h={12} w={50} /></div>)}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(290px,1fr))", gap: 14 }}>
          <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden" }}>
            <div style={{ padding: "11px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: C.accent, fontFamily: "monospace", letterSpacing: 1.5 }}>OPTIMAL STARTERS</span>
              <span style={{ fontSize: 10, fontFamily: "monospace", color: C.accent }}>{projTotal} proj pts</span>
            </div>
            {starters.map(p => <Row key={p.id} p={p} />)}
          </div>
          <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden" }}>
            <div style={{ padding: "11px 14px", borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: C.muted, fontFamily: "monospace", letterSpacing: 1.5 }}>BENCH</span>
            </div>
            {bench.map(p => <Row key={p.id} p={p} />)}
          </div>
        </div>
      )}
    </div>
  );
};
