"use client";
import { useState, useMemo } from "react";
import { C, gradeColor, gradePct, posColor } from "@/lib/theme";
import { CURRENT_SEASON } from "@/lib/constants";
import { usePlayersCtx } from "@/hooks/usePlayersContext";
import { InjuryBadge, PosBadge, TrendIcon, ConfidenceMeter, Skeleton } from "@/components/ui/Badges";
import { DataStatusBanner } from "@/components/ui/DataStatusBanner";
import { PlayerModal } from "@/components/player/PlayerModal";

export const PlayersPage = () => {
  const { players, loading, error, refresh, counts } = usePlayersCtx();
  const [search,     setSearch]     = useState("");
  const [posFilter,  setPosFilter]  = useState("ALL");
  const [showWaiver, setShowWaiver] = useState(false);
  const [modal,      setModal]      = useState(null);
  const [sortBy,     setSortBy]     = useState("ppg");

  const filtered = useMemo(() =>
    players
      .filter(p => posFilter === "ALL" || p.pos === posFilter)
      .filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
      .filter(p => !showWaiver || ((p.news || []).some(n => n.waiver) || (p.owned || 100) < 50))
      .sort((a, b) =>
        sortBy === "ppg"  ? b.ppg - a.ppg :
        sortBy === "adp"  ? (a.adp ?? 999) - (b.adp ?? 999) :
        sortBy === "conf" ? (b.aiRecommendation?.confidence || 0) - (a.aiRecommendation?.confidence || 0) :
        (b.opportunityScore || 0) - (a.opportunityScore || 0)
      ),
    [players, posFilter, search, showWaiver, sortBy]
  );

  return (
    <div>
      <PlayerModal player={modal} onClose={() => setModal(null)} />
      <DataStatusBanner source="live" loading={loading} error={error} playerCount={players.length} counts={counts} refresh={refresh} />
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: C.text, margin: 0, letterSpacing: -0.5 }}>Player Database</h1>
        <p style={{ color: C.muted, fontSize: 12, margin: "4px 0 0" }}>{players.length} players · Live from Sleeper + FantasyCalc · Intelligence metrics computed · Click any card for AI analysis</p>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search players…"
          style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 12px", color: C.text, fontSize: 13, outline: "none", flex: "1 1 180px", minWidth: 0 }} />
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {["ALL","QB","RB","WR","TE","K","DST"].map(pos => (
            <button key={pos} onClick={() => setPosFilter(pos)} style={{ background: posFilter === pos ? posColor(pos) + "22" : C.surface, border: `1px solid ${posFilter === pos ? posColor(pos) : C.border}`, color: posFilter === pos ? posColor(pos) : C.muted, borderRadius: 6, padding: "5px 9px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "monospace" }}>{pos}</button>
          ))}
        </div>
        <button onClick={() => setShowWaiver(v => !v)} style={{ background: showWaiver ? "#22C55E20" : C.surface, border: `1px solid ${showWaiver ? C.accent : C.border}`, borderRadius: 6, padding: "5px 12px", fontSize: 11, color: showWaiver ? C.accent : C.muted, cursor: "pointer", fontWeight: 700 }}>📋 Waiver Targets</button>
        {["ppg","adp","conf","opp"].map(s => (
          <button key={s} onClick={() => setSortBy(s)} style={{ background: sortBy === s ? "#3B82F620" : C.surface, border: `1px solid ${sortBy === s ? C.blue : C.border}`, borderRadius: 6, padding: "5px 9px", fontSize: 11, color: sortBy === s ? C.blue : C.muted, cursor: "pointer", fontFamily: "monospace", fontWeight: 700 }}>
            {s === "conf" ? "AI%" : s === "opp" ? "OPP" : s.toUpperCase()}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(250px,1fr))", gap: 12 }}>
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} style={{ background: C.surface, borderRadius: 10, border: `1px solid ${C.border}`, padding: 14 }}>
              <Skeleton h={14} w="60%" mb={8} /><Skeleton h={10} w="40%" mb={14} /><Skeleton h={10} w="100%" mb={6} /><Skeleton h={10} w="80%" />
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(250px,1fr))", gap: 12 }}>
          {filtered.slice(0, 100).map(p => {
            const gc          = gradeColor(p.matchup?.grade);
            const gp          = gradePct(p.matchup?.grade);
            const hasWaiver   = (p.news || []).some(n => n.waiver);
            const hasBreaking = (p.news || []).some(n => n.urgency === "breaking");
            const rec         = p.aiRecommendation;
            const recCol      = rec?.confidence >= 75 ? C.accent : rec?.confidence >= 55 ? C.blue : rec?.confidence >= 40 ? C.warning : C.danger;
            return (
              <div key={p.id} onClick={() => setModal(p)} style={{ background: C.surface, borderRadius: 10, border: `1px solid ${hasBreaking ? C.danger + "60" : hasWaiver ? C.accent + "40" : C.border}`, padding: 14, cursor: "pointer", transition: "all 0.15s", position: "relative" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent + "70"; e.currentTarget.style.transform = "translateY(-2px)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = hasBreaking ? C.danger + "60" : hasWaiver ? C.accent + "40" : C.border; e.currentTarget.style.transform = "translateY(0)"; }}>
                {hasWaiver && <div style={{ position: "absolute", top: 8, right: 8, fontSize: 9, fontWeight: 800, color: C.accent, background: "#22C55E20", border: "1px solid #22C55E40", borderRadius: 3, padding: "1px 5px", letterSpacing: 1, fontFamily: "monospace" }}>WAIVER</div>}
                {hasBreaking && <div style={{ position: "absolute", top: 8, right: hasWaiver ? 62 : 8, fontSize: 9, fontWeight: 800, color: C.danger, background: "#EF444420", border: "1px solid #EF444440", borderRadius: 3, padding: "1px 5px", letterSpacing: 1, fontFamily: "monospace" }}>BREAKING</div>}

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 5 }}>{p.name}</div>
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                      <PosBadge pos={p.pos} />
                      <span style={{ fontSize: 10, color: C.muted, fontFamily: "monospace", alignSelf: "center" }}>{p.team}</span>
                      <InjuryBadge status={p.injury} />
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: "monospace", fontSize: 19, fontWeight: 800, color: C.accent }}>{p.ppg}</div>
                    <div style={{ fontSize: 9, color: C.muted, letterSpacing: 1 }}>PTS/GM</div>
                  </div>
                </div>

                {p.history?.length > 0 && (
                  <div style={{ display: "flex", gap: 6, marginBottom: 10, alignItems: "center" }}>
                    {[...p.history, { yr: CURRENT_SEASON, ppg: p.ppg, current: true }].map((h, i) => (
                      <div key={i} style={{ flex: 1, textAlign: "center" }}>
                        <div style={{ fontSize: 9, color: h.current ? C.accent : C.muted, fontFamily: "monospace" }}>{h.yr}</div>
                        <div style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: h.current ? C.accent : C.blue }}>{h.ppg}</div>
                      </div>
                    ))}
                  </div>
                )}

                {p.matchup && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                      <span style={{ fontSize: 10, color: C.muted, fontFamily: "monospace" }}>vs {p.matchup.opp}</span>
                      <span style={{ fontSize: 10, fontWeight: 800, color: gc, fontFamily: "monospace" }}>{p.matchup.grade} — {p.matchup.label}</span>
                    </div>
                    <div style={{ height: 3, background: C.border, borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ height: "100%", background: gc, borderRadius: 2, width: gp }} />
                    </div>
                  </div>
                )}

                {rec && (
                  <div style={{ marginBottom: 8, background: recCol + "10", borderRadius: 6, border: `1px solid ${recCol}30`, padding: "6px 8px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                      <span style={{ fontSize: 9, color: recCol, fontFamily: "monospace", fontWeight: 800, letterSpacing: 1 }}>{rec.action}</span>
                      <span style={{ fontSize: 9, fontFamily: "monospace", color: recCol, fontWeight: 700 }}>{rec.confidence}%</span>
                    </div>
                    <ConfidenceMeter value={rec.confidence} size="sm" />
                  </div>
                )}

                <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
                  {[
                    {
                      l: p.positionalAdp != null ? `ADP·${p.pos}${Math.ceil(p.positionalAdp)}` : "ADP",
                      v: p.adp != null
                        ? `${p.adp.toFixed(1)}${p.adpTrend === "rising" ? "▲" : p.adpTrend === "falling" ? "▼" : ""}${p.adpSource === "estimated" ? "~" : ""}`
                        : "—",
                      col: p.adpTrend === "rising" ? C.accent : p.adpTrend === "falling" ? C.danger : C.text,
                    },
                    { l: "OWNED", v: `${p.owned || "?"}%`, col: C.text },
                    { l: "OPP",   v: p.opportunityScore || "—", col: C.text },
                  ].map(s => (
                    <div key={s.l} style={{ textAlign: "center" }}>
                      <div style={{ fontFamily: "monospace", fontSize: 9, color: C.muted }}>{s.l}</div>
                      <div style={{ fontFamily: "monospace", fontSize: 12, color: s.col || C.text, fontWeight: 700 }}>{s.v}</div>
                    </div>
                  ))}
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontFamily: "monospace", fontSize: 9, color: C.muted }}>TREND</div>
                    <TrendIcon trend={p.trend} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
