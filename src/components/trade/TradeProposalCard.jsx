"use client";
import { C, gradeColor } from "@/lib/theme";
import { InjuryBadge, PosBadge, TrendIcon, ConfidenceMeter } from "@/components/ui/Badges";
import { BrainIcon } from "@/components/ui/Icons";
import { ManagerProfileCard } from "@/components/trade/ManagerProfileCard";

export const TradeProposalCard = ({ proposal, onPlayerClick, expanded, onToggle }) => {
  if (!proposal) return null;
  const {
    give, receive, theirProfile, fairnessScore, acceptanceProbability,
    championshipOddsImpact, whyABenefits, whyBBenefits,
    acceptanceReasoning, riskAssessment, byeAnalysis, scheduleAnalysis,
    valueDiffPPG, valueDiffFC,
  } = proposal;

  const fairCol  = fairnessScore >= 80 ? C.accent : fairnessScore >= 60 ? C.blue : fairnessScore >= 40 ? C.warning : C.danger;
  const accCol   = acceptanceProbability >= 70 ? C.accent : acceptanceProbability >= 50 ? C.blue : acceptanceProbability >= 30 ? C.warning : C.danger;
  const champCol = championshipOddsImpact >= 2 ? C.accent : championshipOddsImpact >= 0 ? C.blue : championshipOddsImpact >= -3 ? C.warning : C.danger;
  const riskCol  = riskAssessment.level === "LOW" ? C.accent : riskAssessment.level === "MEDIUM" ? C.warning : C.danger;

  const MiniChip = ({ p }) => (
    <div onClick={() => onPlayerClick(p)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", background: C.bg, borderRadius: 6, border: `1px solid ${C.border}`, cursor: "pointer" }}
      onMouseEnter={e => e.currentTarget.style.borderColor = C.accent + "60"} onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
      <PosBadge pos={p.pos} />
      <span style={{ fontSize: 11, fontWeight: 700, color: C.text, flex: 1, whiteSpace: "nowrap" }}>{p.name}</span>
      <span style={{ fontSize: 11, fontFamily: "monospace", color: C.accent, fontWeight: 700 }}>{p.ppg}</span>
      {p.injury && <InjuryBadge status={p.injury} />}
      <TrendIcon trend={p.trend} />
    </div>
  );

  const Pill = ({ label, value, color, suffix = "" }) => (
    <div style={{ background: color + "12", border: `1px solid ${color}30`, borderRadius: 8, padding: "8px 10px", textAlign: "center", flex: 1, minWidth: 70 }}>
      <div style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 900, color }}>{value}{suffix}</div>
      <div style={{ fontSize: 9, color: C.muted, letterSpacing: 1, marginTop: 1 }}>{label}</div>
    </div>
  );

  return (
    <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden" }}
      onMouseEnter={e => e.currentTarget.style.borderColor = C.accent + "50"}
      onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>

      {/* Header */}
      <div style={{ padding: "11px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8, background: C.surface2 }}>
        <BrainIcon c={C.accent} />
        <span style={{ fontSize: 9, fontWeight: 800, color: C.accent, letterSpacing: 1.5, fontFamily: "monospace" }}>AI TRADE FINDER</span>
        <span style={{ marginLeft: "auto", fontSize: 10, color: C.muted, fontFamily: "monospace" }}>
          with <span style={{ color: C.text, fontWeight: 700 }}>{theirProfile?.displayName}</span>
        </span>
        <button onClick={onToggle} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 5, padding: "2px 8px", fontSize: 10, color: C.muted, cursor: "pointer" }}>
          {expanded ? "▲ Less" : "▼ Full"}
        </button>
      </div>

      <div style={{ padding: 14 }}>
        {/* Trade package */}
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontSize: 9, color: C.danger, fontFamily: "monospace", fontWeight: 800, letterSpacing: 1, marginBottom: 6 }}>YOU GIVE</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>{give.map(p => <MiniChip key={p.id} p={p} />)}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "14px 4px 0", flexShrink: 0 }}>
            <div style={{ fontSize: 16, color: C.muted }}>⇄</div>
            <div style={{ fontSize: 9, fontFamily: "monospace", color: fairCol, fontWeight: 700 }}>{fairnessScore}% fair</div>
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontSize: 9, color: C.accent, fontFamily: "monospace", fontWeight: 800, letterSpacing: 1, marginBottom: 6 }}>YOU RECEIVE</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>{receive.map(p => <MiniChip key={p.id} p={p} />)}</div>
          </div>
        </div>

        {/* Score pills */}
        <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
          <Pill label="FAIRNESS"    value={fairnessScore}                                            color={fairCol}  suffix="%" />
          <Pill label="ACCEPTANCE"  value={acceptanceProbability}                                    color={accCol}   suffix="%" />
          <Pill label="CHAMP ODDS"  value={`${championshipOddsImpact >= 0 ? "+" : ""}${championshipOddsImpact}`} color={champCol} suffix="%" />
          <Pill label="RISK"        value={riskAssessment.level}                                     color={riskCol} />
          <Pill label="PPG GAIN"    value={`${valueDiffPPG >= 0 ? "+" : ""}${valueDiffPPG}`}        color={valueDiffPPG >= 0 ? C.accent : C.danger} />
        </div>

        {/* Why panels */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: expanded ? 12 : 0 }}>
          <div style={{ background: "#22C55E08", borderRadius: 8, border: "1px solid #22C55E25", padding: 10 }}>
            <div style={{ fontSize: 9, color: C.accent, fontFamily: "monospace", fontWeight: 800, letterSpacing: 1, marginBottom: 6 }}>WHY YOU BENEFIT</div>
            {whyABenefits.slice(0, expanded ? 4 : 2).map((b, i) => (
              <div key={i} style={{ fontSize: 11, color: C.muted, marginBottom: 3, lineHeight: 1.4, display: "flex", gap: 5 }}>
                <span style={{ color: C.accent, flexShrink: 0 }}>→</span><span>{b}</span>
              </div>
            ))}
          </div>
          <div style={{ background: "#3B82F608", borderRadius: 8, border: "1px solid #3B82F625", padding: 10 }}>
            <div style={{ fontSize: 9, color: C.blue, fontFamily: "monospace", fontWeight: 800, letterSpacing: 1, marginBottom: 6 }}>WHY THEY BENEFIT</div>
            {whyBBenefits.slice(0, expanded ? 4 : 2).map((b, i) => (
              <div key={i} style={{ fontSize: 11, color: C.muted, marginBottom: 3, lineHeight: 1.4, display: "flex", gap: 5 }}>
                <span style={{ color: C.blue, flexShrink: 0 }}>→</span><span>{b}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Expanded */}
        {expanded && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
            {/* Acceptance deep dive */}
            <div style={{ background: "#0A0E1780", borderRadius: 8, border: `1px solid ${accCol}30`, padding: 12 }}>
              <div style={{ fontSize: 9, color: accCol, fontFamily: "monospace", fontWeight: 800, letterSpacing: 1, marginBottom: 8 }}>ACCEPTANCE PROBABILITY — {acceptanceProbability}%</div>
              <div style={{ height: 5, background: C.border, borderRadius: 3, overflow: "hidden", marginBottom: 10 }}>
                <div style={{ height: "100%", width: `${acceptanceProbability}%`, background: accCol, borderRadius: 3 }} />
              </div>
              <div style={{ fontSize: 9, color: C.muted, fontFamily: "monospace", fontWeight: 800, letterSpacing: 1, marginBottom: 5 }}>REASONING</div>
              {acceptanceReasoning.map((r, i) => (
                <div key={i} style={{ fontSize: 11, color: C.muted, marginBottom: 3, lineHeight: 1.4, display: "flex", gap: 5 }}>
                  <span style={{ color: accCol, flexShrink: 0 }}>•</span><span>{r}</span>
                </div>
              ))}
            </div>

            {theirProfile && <ManagerProfileCard profile={theirProfile} />}

            {/* Risk assessment */}
            <div style={{ background: riskAssessment.level === "LOW" ? "#22C55E08" : riskAssessment.level === "MEDIUM" ? "#F59E0B08" : "#EF444408", borderRadius: 8, border: `1px solid ${riskCol}30`, padding: 12 }}>
              <div style={{ fontSize: 9, color: riskCol, fontFamily: "monospace", fontWeight: 800, letterSpacing: 1, marginBottom: 6 }}>RISK ASSESSMENT — {riskAssessment.level}</div>
              {riskAssessment.factors.map((f, i) => (
                <div key={i} style={{ fontSize: 11, color: C.muted, marginBottom: 3, lineHeight: 1.4, display: "flex", gap: 5 }}>
                  <span style={{ color: riskCol, flexShrink: 0 }}>⚠</span><span>{f}</span>
                </div>
              ))}
            </div>

            {/* Bye + Schedule */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div style={{ background: C.surface2, borderRadius: 8, border: `1px solid ${C.border}`, padding: 10 }}>
                <div style={{ fontSize: 9, color: C.muted, fontFamily: "monospace", fontWeight: 800, letterSpacing: 1, marginBottom: 6 }}>BYE WEEK IMPACT</div>
                {byeAnalysis.conflicts.length > 0 && <div style={{ fontSize: 10, color: C.warning, marginBottom: 4, fontFamily: "monospace" }}>⚠ {byeAnalysis.conflicts.join(", ")}</div>}
                {byeAnalysis.receiveByes.length > 0 && <div style={{ fontSize: 10, color: C.muted }}>Receive: {byeAnalysis.receiveByes.join(", ")}</div>}
                {byeAnalysis.giveByes.length > 0 && <div style={{ fontSize: 10, color: C.muted }}>Give: {byeAnalysis.giveByes.join(", ")}</div>}
                {!byeAnalysis.conflicts.length && !byeAnalysis.receiveByes.length && <div style={{ fontSize: 10, color: C.muted }}>No bye week conflicts detected</div>}
              </div>
              <div style={{ background: C.surface2, borderRadius: 8, border: `1px solid ${C.border}`, padding: 10 }}>
                <div style={{ fontSize: 9, color: C.muted, fontFamily: "monospace", fontWeight: 800, letterSpacing: 1, marginBottom: 6 }}>SCHEDULE ANALYSIS</div>
                <div style={{ fontSize: 10, color: scheduleAnalysis.weekMatchupAdvantage ? C.accent : C.muted, marginBottom: 2 }}>{scheduleAnalysis.weekMatchupAdvantage ? "✓" : "–"} Week matchup: {scheduleAnalysis.receiveMatchupLabel} incoming</div>
                <div style={{ fontSize: 10, color: scheduleAnalysis.playoffAdvantage ? C.accent : C.muted, marginBottom: 2 }}>{scheduleAnalysis.playoffAdvantage ? "✓" : "–"} Playoff SOS: {scheduleAnalysis.avgReceivePlayoffSOS}/100 vs {scheduleAnalysis.avgGivePlayoffSOS}/100</div>
                <div style={{ fontSize: 10, color: scheduleAnalysis.sosAdvantage ? C.accent : C.muted }}>{scheduleAnalysis.sosAdvantage ? "✓" : "–"} Strength of schedule favors received players</div>
              </div>
            </div>

            {/* FC value */}
            {valueDiffFC !== 0 && (
              <div style={{ background: C.surface2, borderRadius: 8, border: `1px solid ${C.border}`, padding: 10 }}>
                <div style={{ fontSize: 9, color: C.muted, fontFamily: "monospace", fontWeight: 800, letterSpacing: 1, marginBottom: 6 }}>FANTASYCALC VALUE</div>
                <div style={{ display: "flex", gap: 12 }}>
                  {[
                    { l: "You Give (FC)",    v: give.reduce((s, p) => s + (p.fcValue || 0), 0) || "—" },
                    { l: "You Receive (FC)", v: receive.reduce((s, p) => s + (p.fcValue || 0), 0) || "—" },
                    { l: "Net Value",        v: valueDiffFC >= 0 ? `+${valueDiffFC}` : valueDiffFC, col: valueDiffFC >= 0 ? C.accent : C.danger },
                  ].map(s => (
                    <div key={s.l} style={{ flex: 1, textAlign: "center" }}>
                      <div style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 800, color: s.col || C.text }}>{s.v}</div>
                      <div style={{ fontSize: 9, color: C.muted }}>{s.l}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
