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

  const needsPos = pos => (myPosCounts[pos] || 0) < ((settings.slots[pos] || 0) + (["RB","WR"].includes(pos) ? (settings.slots.FLEX || 0) * 0.5 : 0));

  const scorePlayer = p => {
    let s = p.ppg * 3;
    if (p.injury === "OUT" || p.injury === "IR") return -999;
    if (p.injury === "Q") s -= 8;
    const gc = p.matchup?.grade;
    if (gc === "A") s += 8; if (gc === "B") s += 4; if (gc === "D") s -= 6;
    s += (p.opportunityScore  || 50) * 0.1;
    s += (p.consistencyScore  || 50) * 0.05;
    s += (p.boomPct           || 20) * 0.08;
    s -= (p.bustPct           || 20) * 0.06;
    s += (p.sosScore          || 50) * 0.04;
    s += (p.playoffSosScore   || 50) * 0.06;
    if (p.trend === "up") s += 5; if (p.trend === "down") s -= 3;
    if (needsPos(p.pos)) s += 18;
    if (settings.superflex && p.pos === "QB" && (myPosCounts.QB || 0) < 2) s += 12;
    return s;
  };

  const available    = players.filter(p => !allDrafted.has(p.id));
  const filtered     = available.filter(p => posFilter === "ALL" || p.pos === posFilter).filter(p => p.name.toLowerCase().includes(search.toLowerCase())).sort((a, b) => (a.adp ?? 999) - (b.adp ?? 999));
  const bestOverall  = [...available].filter(p => !["OUT","IR"].includes(p.injury)).sort((a, b) => b.ppg - a.ppg)[0];
  const bestTeam     = [...available].sort((a, b) => scorePlayer(b) - scorePlayer(a))[0];
  const sleeperPick  = [...available].filter(p => (p.adp == null || p.adp > 25) && p.trend === "up" && !p.injury && p.ppg > 8).sort((a, b) => (b.opportunityScore || 0) - (a.opportunityScore || 0) - (b.adp ?? 50) / 10 + (a.adp ?? 50) / 10)[0];

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
            <RecCard label="BEST AVAILABLE"     player={bestOverall}  color={C.accent}  icon="🏆" onDraft={draft} onView={setModal} />
            <RecCard label="BEST FOR YOUR TEAM" player={bestTeam}     color={C.blue}    icon="🎯" onDraft={draft} onView={setModal} />
            {sleeperPick && <RecCard label="SLEEPER PICK"   player={sleeperPick} color={C.warning} icon="💎" onDraft={draft} onView={setModal} />}
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
                const isBO   = p.id === bestOverall?.id;
                const isBT   = p.id === bestTeam?.id;
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
