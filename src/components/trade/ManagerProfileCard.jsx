"use client";
import { C } from "@/lib/theme";

export const ManagerProfileCard = ({ profile }) => {
  if (!profile) return null;
  const recCol = profile.acceptanceBaserate >= 60 ? C.accent : profile.acceptanceBaserate >= 40 ? C.warning : C.danger;
  const GradeTag = ({ pos, grade }) => {
    const col = { A: C.accent, B: C.blue, C: C.warning, D: C.danger }[grade] || C.muted;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ fontSize: 9, color: C.muted, fontFamily: "monospace" }}>{pos}</span>
        <span style={{ fontSize: 11, fontWeight: 800, color: col, fontFamily: "monospace" }}>{grade}</span>
      </div>
    );
  };
  return (
    <div style={{ background: C.surface2, borderRadius: 10, border: `1px solid ${C.border}`, padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: C.accent + "20", border: `1px solid ${C.accent}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 900, color: C.accent, flexShrink: 0 }}>
          {(profile.displayName || "?")[0].toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{profile.displayName}</div>
          <div style={{ fontSize: 10, color: C.muted, fontFamily: "monospace" }}>{profile.record.wins}–{profile.record.losses} · Rank #{profile.rank}/{profile.totalTeams}</div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: recCol, fontFamily: "monospace" }}>{profile.acceptanceBaserate}%</div>
          <div style={{ fontSize: 9, color: C.muted }}>trade open</div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginBottom: 8 }}>
        {Object.entries(profile.rosterGrades || {}).map(([pos, g]) => <GradeTag key={pos} pos={pos} grade={g} />)}
      </div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        <span style={{ background: C.bg, borderRadius: 3, padding: "1px 5px", fontFamily: "monospace", fontSize: 9, color: profile.tradeFreq >= 3 ? C.accent : C.muted }}>{profile.tradeFreqLabel}</span>
        <span style={{ background: C.bg, borderRadius: 3, padding: "1px 5px", fontFamily: "monospace", fontSize: 9, color: profile.waiverActivity >= 2 ? C.accent : C.muted }}>{profile.waiverLabel}</span>
        {profile.playoffContention
          ? <span style={{ background: "#22C55E15", border: "1px solid #22C55E40", borderRadius: 3, padding: "1px 5px", fontFamily: "monospace", fontSize: 9, color: C.accent }}>PLAYOFF HUNT</span>
          : <span style={{ background: "#EF444415", border: "1px solid #EF444440", borderRadius: 3, padding: "1px 5px", fontFamily: "monospace", fontSize: 9, color: C.danger }}>OUT OF HUNT</span>
        }
      </div>
    </div>
  );
};
