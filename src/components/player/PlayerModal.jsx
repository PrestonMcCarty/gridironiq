"use client";
import { C, gradeColor, gradePct, NEWS_SOURCES } from "@/lib/theme";
import { usePlayersCtx } from "@/hooks/usePlayersContext";
import { InjuryBadge, PosBadge, ConfidenceMeter, IntelBar } from "@/components/ui/Badges";
import { CloseIcon, BrainIcon } from "@/components/ui/Icons";
import { HistoryBar } from "@/components/ui/HistoryBar";
import { NewsItem } from "@/components/ui/NewsItem";
import { AIRecPanel } from "@/components/ui/AIRecPanel";

export const PlayerModal = ({ player, onClose }) => {
  const { players } = usePlayersCtx();
  if (!player) return null;
  const p = players.find(x => x.id === player.id) || player;
  const gc = gradeColor(p.matchup?.grade);
  const gp = gradePct(p.matchup?.grade);
  const waiverNews  = (p.news || []).filter(n => n.waiver);
  const regularNews = (p.news || []).filter(n => !n.waiver);
  const posRank = players.filter(x => x.pos === p.pos).sort((a, b) => b.ppg - a.ppg).findIndex(x => x.id === p.id) + 1;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "#000000d0", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.surface, borderRadius: 16, border: `1px solid ${C.border}`, width: "100%", maxWidth: 620, maxHeight: "92vh", overflowY: "auto" }}>
        {/* ── TEMP BUILD MARKER — proves the edited PlayerModal.jsx is rendering ── */}
        <div style={{ background: "#FF00AA", color: "#FFFFFF", fontFamily: "monospace", fontSize: 12, fontWeight: 900, letterSpacing: 1, textAlign: "center", padding: "6px 0" }}>
          BUILD: SITSTART_DEBUG_V1
        </div>
        {/* Header */}
        <div style={{ padding: "18px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <PosBadge pos={p.pos} />
              <span style={{ fontSize: 11, fontFamily: "monospace", color: C.muted }}>{p.team}</span>
              <InjuryBadge status={p.injury} />
              {p.owned > 0 && <span style={{ fontSize: 10, color: C.muted, fontFamily: "monospace" }}>{p.owned}% owned</span>}
            </div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: C.text, letterSpacing: -0.5 }}>{p.name}</h2>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><CloseIcon c={C.muted} /></button>
        </div>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", borderBottom: `1px solid ${C.border}` }}>
          {[
            { l: "PTS/GM",  v: p.ppg,                              col: C.accent },
            { l: `${p.pos} RANK`, v: `#${posRank}`,               col: C.text   },
            { l: "L4 AVG",  v: p.last4Avg?.toFixed(1) || "—",     col: p.trend === "up" ? C.accent : p.trend === "down" ? C.danger : C.text },
            {
              l: p.positionalAdp != null
                ? `ADP · ${p.pos}${Math.ceil(p.positionalAdp)}`
                : "ADP",
              v: p.adp != null
                ? `${p.adp.toFixed(1)}${p.adpTrend === "rising" ? " ▲" : p.adpTrend === "falling" ? " ▼" : ""}${p.adpSource === "estimated" ? "~" : ""}`
                : "—",
              col: p.adpTrend === "rising" ? C.accent : p.adpTrend === "falling" ? C.danger : C.text,
            },
          ].map(s => (
            <div key={s.l} style={{ padding: "14px 0", textAlign: "center", borderRight: `1px solid ${C.border}` }}>
              <div style={{ fontFamily: "monospace", fontSize: 17, fontWeight: 900, color: s.col }}>{s.v}</div>
              <div style={{ fontSize: 9, color: C.muted, letterSpacing: 1.5, marginTop: 2 }}>{s.l}</div>
            </div>
          ))}
        </div>

        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
          {/* ── TEMP DEBUG PANEL — runtime recommendation diagnostics ── */}
          {p.aiRecommendation?._diag && (
            <DebugPanel
              rec={p.aiRecommendation}
              diag={p.aiRecommendation._diag}
              debug={p._debug}
            />
          )}

          {/* AI Recommendation */}
          {p.aiRecommendation && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, color: p.aiRecommendation.action === "OFFSEASON" ? C.muted : C.accent, letterSpacing: 1.5, fontFamily: "monospace", marginBottom: 8 }}>
                {p.aiRecommendation.action === "OFFSEASON" ? `⏸ OFFSEASON — ${p.name}` : `⚡ RECOMMENDATION: ${p.aiRecommendation.action} ${p.name}`}
              </div>
              <AIRecPanel rec={p.aiRecommendation} />
            </div>
          )}

          {/* Intelligence metrics */}
          <div style={{ background: C.surface2, borderRadius: 10, border: `1px solid ${C.border}`, padding: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: C.muted, letterSpacing: 1.5, fontFamily: "monospace", marginBottom: 10 }}>INTELLIGENCE METRICS</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 20px" }}>
              <IntelBar label="OPPORTUNITY" value={p.opportunityScore || 0} color={C.blue} />
              <IntelBar label="CONSISTENCY" value={p.consistencyScore || 0} color={C.accent} />
              <IntelBar label="BOOM RATE"   value={p.boomPct || 0}         color={C.purple} />
              <IntelBar label="INJURY SAFE" value={p.injuryRiskScore || 90} color={C.warning} />
              <IntelBar label="SOS SCORE"   value={p.sosScore || 50}       color={C.blue} />
              <IntelBar label="PLAYOFF SOS" value={p.playoffSosScore || 50} color={C.accent} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginTop: 10 }}>
              {[
                { l: "SEASON AVG", v: (p.seasonAvg || p.ppg)?.toFixed(1) },
                { l: "LAST 4",    v: p.last4Avg?.toFixed(1) || "—" },
                { l: "LAST 8",    v: p.last8Avg?.toFixed(1) || "—" },
              ].map(s => (
                <div key={s.l} style={{ textAlign: "center", background: C.bg, borderRadius: 6, padding: "6px 4px" }}>
                  <div style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 800, color: C.accent }}>{s.v}</div>
                  <div style={{ fontSize: 9, color: C.muted, letterSpacing: 1 }}>{s.l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* History */}
          {p.history?.length > 0 && <HistoryBar history={p.history} ppg={p.ppg} />}

          {/* Strengths / weaknesses */}
          {(p.strengths?.length || p.weaknesses?.length) && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {p.strengths?.length > 0 && (
                <div style={{ background: "#22C55E0d", borderRadius: 8, border: "1px solid #22C55E30", padding: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: C.accent, letterSpacing: 1.5, fontFamily: "monospace", marginBottom: 8 }}>✓ STRENGTHS</div>
                  {p.strengths.map((s, i) => <div key={i} style={{ fontSize: 11, color: C.muted, marginBottom: 4, lineHeight: 1.4 }}>• {s}</div>)}
                </div>
              )}
              {p.weaknesses?.length > 0 && (
                <div style={{ background: "#EF444408", borderRadius: 8, border: "1px solid #EF444430", padding: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: C.danger, letterSpacing: 1.5, fontFamily: "monospace", marginBottom: 8 }}>✗ CONCERNS</div>
                  {p.weaknesses.map((w, i) => <div key={i} style={{ fontSize: 11, color: C.muted, marginBottom: 4, lineHeight: 1.4 }}>• {w}</div>)}
                </div>
              )}
            </div>
          )}

          {/* Matchup */}
          {p.matchup && (
            <div style={{ padding: 14, background: C.surface2, borderRadius: 10, border: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: C.muted, letterSpacing: 1.5, fontFamily: "monospace" }}>MATCHUP vs {p.matchup.opp}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ background: gc + "20", border: `1px solid ${gc}`, borderRadius: 5, padding: "2px 9px", fontFamily: "monospace", fontSize: 12, fontWeight: 900, color: gc }}>{p.matchup.grade}</div>
                  <span style={{ fontSize: 11, color: gc, fontWeight: 700 }}>{p.matchup.label}</span>
                </div>
              </div>
              <div style={{ height: 4, background: C.border, borderRadius: 2, marginBottom: 10, overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 2, background: gc, width: gp }} />
              </div>
              {p.matchup.defRank && (
                <div style={{ fontSize: 11, color: C.muted, fontFamily: "monospace", marginBottom: 6 }}>
                  Def rank vs {p.pos}: <span style={{ color: gc, fontWeight: 700 }}>#{p.matchup.defRank}</span>
                </div>
              )}
              <p style={{ margin: "0 0 10px", fontSize: 12, color: C.muted, lineHeight: 1.65 }}>{p.matchup.summary}</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {p.matchup.keyStats?.map((s, i) => (
                  <span key={i} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, padding: "2px 8px", fontSize: 10, color: C.muted, fontFamily: "monospace" }}>{s}</span>
                ))}
              </div>
            </div>
          )}

          {/* Injury detail */}
          {p.injuryDetail && (
            <div style={{ padding: 14, background: "#EF444408", borderRadius: 10, border: "1px solid #EF444430" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: C.danger, letterSpacing: 1.5, fontFamily: "monospace" }}>INJURY REPORT</span>
                <InjuryBadge status={p.injuryDetail.status} />
                <span style={{ fontSize: 10, color: C.danger, marginLeft: "auto", fontFamily: "monospace" }}>{p.injuryDetail.timeline}</span>
              </div>
              <p style={{ margin: 0, fontSize: 12, color: C.muted, lineHeight: 1.65 }}>{p.injuryDetail.detail}</p>
            </div>
          )}

          {/* Waiver alerts */}
          {waiverNews.length > 0 && (
            <div style={{ padding: 14, background: "#22C55E08", borderRadius: 10, border: "1px solid #22C55E30" }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: C.accent, letterSpacing: 1.5, fontFamily: "monospace", marginBottom: 8 }}>📋 WAIVER WIRE ALERTS</div>
              {waiverNews.map((n, i) => <NewsItem key={i} item={n} />)}
            </div>
          )}

          {/* Regular news */}
          {regularNews.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, color: C.muted, letterSpacing: 1.5, fontFamily: "monospace", marginBottom: 6 }}>LATEST NEWS</div>
              {regularNews.map((n, i) => <NewsItem key={i} item={n} />)}
            </div>
          )}

          {/* Source links */}
          <div style={{ display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap", paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
            {Object.values(NEWS_SOURCES).map(src => (
              <a key={src.label} href={src.url} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: src.color, fontFamily: "monospace", textDecoration: "none", fontWeight: 700 }}>
                {src.label} ↗
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── TEMP DEBUG PANEL — runtime recommendation diagnostics ──────────────────
// Renders the exact values aiExplanation.js used to make its decision, so the
// offseason condition can be inspected directly in the UI. Remove once verified.
const DebugPanel = ({ rec, diag, debug }) => {
  const yesNo = (b) => (b ? { t: "TRUE", c: "#22C55E" } : { t: "FALSE", c: "#EF4444" });
  const Row = ({ k, v, col }) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "3px 0", borderBottom: "1px solid #ffffff10" }}>
      <span style={{ fontSize: 10, color: "#94A3B8", fontFamily: "monospace" }}>{k}</span>
      <span style={{ fontSize: 10, color: col || "#E2E8F0", fontFamily: "monospace", fontWeight: 700, textAlign: "right", wordBreak: "break-word" }}>{v}</span>
    </div>
  );

  const c1 = yesNo(diag.cond_seasonNotStarted);
  const c2 = yesNo(diag.cond_noScores);
  const offs = yesNo(diag.isOffseason);

  // Identify the failing leg (first condition that is false)
  const failing = !diag.cond_seasonNotStarted ? `cond_seasonNotStarted (seasonStarted=${diag.seasonStarted} — games already played)`
    : !diag.cond_noScores ? `cond_noScores (scoresLength=${diag.scoresLength} > 0)`
    : "none — all conditions TRUE";

  return (
    <div style={{ background: "#1A1206", borderRadius: 10, border: "1px solid #F59E0B60", padding: 14 }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: "#F59E0B", letterSpacing: 1.5, fontFamily: "monospace", marginBottom: 10 }}>
        🐞 RUNTIME DEBUG — RECOMMENDATION ENGINE
      </div>

      <Row k="recommendationSource" v={diag.recommendationSource} col={diag.recommendationSource === "OFFSEASON_BRANCH" ? "#22C55E" : "#F59E0B"} />
      <Row k="action" v={String(rec.action)} col="#E2E8F0" />
      <Row k="confidence" v={rec.confidence == null ? "null" : `${rec.confidence}%`} col="#E2E8F0" />

      <div style={{ height: 8 }} />
      <div style={{ fontSize: 9, color: "#F59E0B", fontFamily: "monospace", marginBottom: 4 }}>OFFSEASON CONDITION (both must be TRUE):</div>
      <Row k="① seasonStarted === false" v={c1.t} col={c1.c} />
      <Row k="② scoresLength === 0" v={c2.t} col={c2.c} />
      <Row k="⇒ isOffseason" v={offs.t} col={offs.c} />
      <Row k="⇒ FAILING LEG" v={failing} col={diag.isOffseason ? "#22C55E" : "#EF4444"} />

      <div style={{ height: 8 }} />
      <div style={{ fontSize: 9, color: "#F59E0B", fontFamily: "monospace", marginBottom: 4 }}>RAW RUNTIME VALUES:</div>
      <Row k="staleFlags" v={JSON.stringify(diag.staleFlags)} />
      <Row k="scoresLength" v={String(diag.scoresLength)} />
      <Row k="consistencyScore" v={String(diag.consistencyScore)} />
      <Row k="opportunityScore (key on p)" v={String(diag.opportunityScore)} col={diag.opportunityScore === undefined ? "#EF4444" : "#E2E8F0"} />
      <Row k="oppScore (real computed key)" v={String(diag.oppScore)} />
      <Row k="matchupGrade" v={String(diag.matchupGrade)} />
      <Row k="oppTeam" v={String(diag.oppTeam)} />
      <Row k="injuryStatus" v={String(diag.injuryStatus)} />
      <Row k="injuryRiskScore" v={String(diag.injuryRiskScore)} />
      <Row k="seasonUsed" v={String(diag.seasonUsed)} />
      <Row k="currentWeek" v={String(diag.currentWeek)} />
      <Row k="seasonAvg" v={String(diag.seasonAvg)} />
      <Row k="ppg" v={String(diag.ppg)} />

      {debug && (
        <>
          <div style={{ height: 8 }} />
          <div style={{ fontSize: 9, color: "#F59E0B", fontFamily: "monospace", marginBottom: 4 }}>_debug CROSS-CHECK:</div>
          <Row k="historicalWeeksUsed" v={String(debug.historicalWeeksUsed)} />
          <Row k="missingOpponent" v={String(debug.missingOpponent)} />
          <Row k="missingStats" v={String(debug.missingStats)} />
          <Row k="matchupSource" v={String(debug.matchupSource)} />
        </>
      )}
    </div>
  );
};
