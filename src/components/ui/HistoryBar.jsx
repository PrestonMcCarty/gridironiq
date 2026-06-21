"use client";
import { C } from "@/lib/theme";
import { CURRENT_SEASON } from "@/lib/constants";

export const HistoryBar = ({ history, ppg }) => {
  const all = [...(history || []), { yr: CURRENT_SEASON, ppg, current: true }];
  const max = Math.max(...all.map(h => h.ppg), 1);
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 800, color: C.muted, letterSpacing: 1.5, fontFamily: "monospace", marginBottom: 8 }}>SEASON HISTORY</div>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", height: 70 }}>
        {all.map((h, i) => (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 10, fontFamily: "monospace", color: h.current ? C.accent : C.blue, fontWeight: 700 }}>{h.ppg}</span>
            <div style={{ width: "100%", background: C.border, borderRadius: 3, height: 44, display: "flex", alignItems: "flex-end" }}>
              <div style={{ width: "100%", height: `${(h.ppg / max) * 100}%`, background: h.current ? C.accent : C.blue, borderRadius: 3 }} />
            </div>
            <span style={{ fontSize: 9, color: h.current ? C.accent : C.muted, fontFamily: "monospace", fontWeight: h.current ? 700 : 400 }}>{h.yr}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
