"use client";
import { C } from "@/lib/theme";

export const StandingsSidebar = ({ profiles, myRosterId }) => {
  if (!profiles || !Object.keys(profiles).length) return null;
  const sorted = Object.values(profiles).sort((a, b) =>
    b.record.wins - a.record.wins || b.record.pf - a.record.pf
  );
  return (
    <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden", minWidth: 200 }}>
      <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}` }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: C.muted, letterSpacing: 1.5, fontFamily: "monospace" }}>STANDINGS</span>
      </div>
      {sorted.map((p, idx) => {
        const isMe   = p.rosterId === myRosterId;
        const recCol = p.acceptanceBaserate >= 60 ? C.accent : p.acceptanceBaserate >= 40 ? C.blue : C.muted;
        return (
          <div key={p.rosterId} style={{ padding: "8px 14px", borderBottom: `1px solid ${C.border}`, background: isMe ? "#22C55E08" : "transparent", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 10, fontFamily: "monospace", color: C.muted, width: 16, flexShrink: 0 }}>#{idx + 1}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: isMe ? C.accent : C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.displayName}{isMe ? " (You)" : ""}</div>
              <div style={{ fontSize: 9, color: C.muted, fontFamily: "monospace" }}>{p.record.wins}–{p.record.losses}</div>
            </div>
            <div style={{ fontSize: 9, fontFamily: "monospace", color: recCol, fontWeight: 700, flexShrink: 0 }}>{p.acceptanceBaserate}%</div>
          </div>
        );
      })}
      <div style={{ padding: "8px 14px" }}>
        <div style={{ fontSize: 9, color: C.muted, lineHeight: 1.5 }}>% = trade acceptance probability</div>
      </div>
    </div>
  );
};
