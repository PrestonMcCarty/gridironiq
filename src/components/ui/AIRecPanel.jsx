"use client";
import { C } from "@/lib/theme";
import { BrainIcon } from "@/components/ui/Icons";
import { ConfidenceMeter } from "@/components/ui/Badges";

export const AIRecPanel = ({ rec, compact = false }) => {
  if (!rec) return null;
  const { action, confidence, reasons = [], riskFactors = [] } = rec;
  const actionCol =
    action === "START" || action === "LEAN START" ? C.accent
    : action === "SIT" || action === "LEAN SIT" ? C.danger
    : C.warning;

  return (
    <div style={{ background: "#0A0E1780", borderRadius: 10, border: `1px solid ${actionCol}40`, padding: compact ? 10 : 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <BrainIcon c={actionCol} />
        <span style={{ fontSize: 9, fontWeight: 800, color: actionCol, letterSpacing: 1.5, fontFamily: "monospace" }}>AI ENGINE</span>
        <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 800, fontFamily: "monospace", color: actionCol, background: actionCol + "20", border: `1px solid ${actionCol}50`, borderRadius: 4, padding: "1px 7px", letterSpacing: 0.5 }}>{action}</span>
      </div>
      {!compact && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 9, color: C.muted, fontFamily: "monospace", letterSpacing: 1, marginBottom: 4 }}>CONFIDENCE</div>
          <ConfidenceMeter value={confidence} />
        </div>
      )}
      {compact && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <span style={{ fontSize: 10, color: C.muted, fontFamily: "monospace" }}>Confidence:</span>
          <ConfidenceMeter value={confidence} size="sm" />
        </div>
      )}
      {reasons.length > 0 && (
        <div style={{ marginBottom: compact ? 0 : 8 }}>
          <div style={{ fontSize: 9, color: C.accent, fontFamily: "monospace", letterSpacing: 1, marginBottom: 4 }}>WHY</div>
          {reasons.slice(0, compact ? 2 : 5).map((r, i) => (
            <div key={i} style={{ fontSize: 11, color: C.muted, marginBottom: 3, lineHeight: 1.4, display: "flex", gap: 5 }}>
              <span style={{ color: C.accent, flexShrink: 0 }}>→</span><span>{r}</span>
            </div>
          ))}
        </div>
      )}
      {!compact && riskFactors.length > 0 && (
        <div>
          <div style={{ fontSize: 9, color: C.danger, fontFamily: "monospace", letterSpacing: 1, marginBottom: 4 }}>RISK FACTORS</div>
          {riskFactors.map((r, i) => (
            <div key={i} style={{ fontSize: 11, color: C.muted, marginBottom: 3, lineHeight: 1.4, display: "flex", gap: 5 }}>
              <span style={{ color: C.danger, flexShrink: 0 }}>⚠</span><span>{r}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
