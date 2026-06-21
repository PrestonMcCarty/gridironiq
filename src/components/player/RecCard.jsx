"use client";
import { C, gradeColor } from "@/lib/theme";
import { InjuryBadge, PosBadge, TrendIcon, ConfidenceMeter } from "@/components/ui/Badges";

export const RecCard = ({ label, player, color, icon, onDraft, onView }) => {
  if (!player) return null;
  const rec = player.aiRecommendation;
  const gc  = gradeColor(player.matchup?.grade);

  return (
    <div style={{ background: C.surface2, borderRadius: 12, border: `1px solid ${color}40`, padding: 16, flex: 1, minWidth: 220, display: "flex", flexDirection: "column", gap: 10 }}>
      <span style={{ fontSize: 9, fontWeight: 800, color, letterSpacing: 1.5, fontFamily: "monospace" }}>{icon} {label}</span>
      <div>
        <div style={{ fontSize: 11, color: C.muted, fontFamily: "monospace", marginBottom: 4 }}>Recommendation:</div>
        <div style={{ fontSize: 15, fontWeight: 900, color: C.text, marginBottom: 5 }}>
          {rec?.action === "START" || rec?.action === "LEAN START" ? "Draft " : ""}{player.name}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <PosBadge pos={player.pos} />
          <span style={{ fontSize: 11, color: C.muted, fontFamily: "monospace" }}>{player.team}</span>
          <InjuryBadge status={player.injury} />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6 }}>
        {[
          { l: "PPG", v: player.ppg, c: C.accent },
          { l: "ADP", v: player.adp?.toFixed(1) || "—", c: C.muted },
          { l: "WK",  v: player.matchup?.grade || "?", c: gc },
        ].map(s => (
          <div key={s.l} style={{ background: C.bg, borderRadius: 6, padding: "6px", textAlign: "center" }}>
            <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 800, color: s.c }}>{s.v}</div>
            <div style={{ fontSize: 9, color: C.muted, letterSpacing: 1 }}>{s.l}</div>
          </div>
        ))}
      </div>

      {rec && (
        <div style={{ background: color + "10", borderRadius: 8, border: `1px solid ${color}30`, padding: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <div style={{ fontSize: 9, fontWeight: 800, color, letterSpacing: 1.5, fontFamily: "monospace" }}>CONFIDENCE</div>
            <div style={{ fontSize: 11, fontWeight: 900, color, fontFamily: "monospace" }}>{rec.confidence}%</div>
          </div>
          <ConfidenceMeter value={rec.confidence} size="sm" />
          <div style={{ fontSize: 9, fontWeight: 800, color: C.accent, letterSpacing: 1.5, fontFamily: "monospace", margin: "10px 0 5px" }}>WHY</div>
          {(rec.reasons || []).slice(0, 3).map((r, i) => (
            <div key={i} style={{ fontSize: 11, color: C.muted, marginBottom: 4, lineHeight: 1.45, display: "flex", gap: 6 }}>
              <span style={{ color, flexShrink: 0 }}>→</span><span>{r}</span>
            </div>
          ))}
          {(rec.riskFactors || []).length > 0 && (
            <>
              <div style={{ fontSize: 9, fontWeight: 800, color: C.danger, letterSpacing: 1.5, fontFamily: "monospace", margin: "8px 0 5px" }}>RISK FACTORS</div>
              {(rec.riskFactors || []).slice(0, 2).map((r, i) => (
                <div key={i} style={{ fontSize: 11, color: C.muted, marginBottom: 3, lineHeight: 1.4, display: "flex", gap: 6 }}>
                  <span style={{ color: C.danger, flexShrink: 0 }}>⚠</span><span>{r}</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <TrendIcon trend={player.trend} />
        <span style={{ fontSize: 11, color: C.muted }}>
          {player.trend === "up" ? "Trending up — momentum play" : player.trend === "down" ? "Trending down — use caution" : "Consistent producer"}
        </span>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={() => onView(player)} style={{ flex: 1, background: "none", border: `1px solid ${C.border}`, borderRadius: 6, padding: "7px", fontSize: 11, color: C.muted, cursor: "pointer", fontWeight: 600 }}>View Profile</button>
        <button onClick={() => onDraft(player.id, true)} style={{ flex: 1, background: color + "20", border: `1px solid ${color}50`, borderRadius: 6, padding: "7px", fontSize: 11, color, cursor: "pointer", fontWeight: 700 }}>✓ Draft Mine</button>
      </div>
    </div>
  );
};
