"use client";
import { C, NEWS_SOURCES } from "@/lib/theme";

export const NewsItem = ({ item }) => {
  const src = NEWS_SOURCES[item.source] || NEWS_SOURCES.nfl;
  return (
    <div style={{ padding: "10px 0", borderBottom: `1px solid ${C.border}40` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, flexWrap: "wrap" }}>
        {item.urgency === "breaking" && (
          <span style={{ fontSize: 9, fontWeight: 800, color: C.danger, background: "#EF444420", border: "1px solid #EF444440", borderRadius: 3, padding: "1px 6px", letterSpacing: 1, fontFamily: "monospace" }}>BREAKING</span>
        )}
        {item.urgency === "high" && (
          <span style={{ fontSize: 9, fontWeight: 800, color: C.warning, background: "#F59E0B20", border: "1px solid #F59E0B40", borderRadius: 3, padding: "1px 6px", letterSpacing: 1, fontFamily: "monospace" }}>ALERT</span>
        )}
        {item.waiver && (
          <span style={{ fontSize: 9, fontWeight: 800, color: C.accent, background: "#22C55E20", border: "1px solid #22C55E40", borderRadius: 3, padding: "1px 6px", letterSpacing: 1, fontFamily: "monospace" }}>📋 WAIVER</span>
        )}
        <a href={src.url} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: src.color, fontFamily: "monospace", fontWeight: 700, textDecoration: "none", marginLeft: "auto" }}>
          {src.label} ↗
        </a>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: item.urgency !== "normal" ? C.text : C.muted, lineHeight: 1.6 }}>
        {item.text}
      </p>
    </div>
  );
};
