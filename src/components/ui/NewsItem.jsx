"use client";
import { C, NEWS_SOURCES } from "@/lib/theme";

// Severity → display config mapping
const SEVERITY_CFG = {
  CRITICAL: { label: "BREAKING", bg: "#EF444420", bd: "#EF444440", tx: C.danger },
  ALERT:    { label: "ALERT",    bg: "#F97316" + "20", bd: "#F97316" + "40", tx: "#F97316" },
  WATCH:    { label: "WATCH",    bg: "#F59E0B20", bd: "#F59E0B40", tx: C.warning },
  INFO:     null, // no badge
};

export const NewsItem = ({ item }) => {
  const src = NEWS_SOURCES[item.source] || NEWS_SOURCES.nfl;
  // Support both new `severity` field and legacy `urgency` field
  const severity = item.severity
    || (item.urgency === "breaking" ? "CRITICAL" : item.urgency === "high" ? "ALERT" : "INFO");
  const sevCfg = SEVERITY_CFG[severity] || null;
  const text = item.headline || item.text || "";

  // Relative timestamp (e.g. "14 min ago")
  const ageLabel = item.timestamp
    ? (() => {
        const mins = Math.round((Date.now() - item.timestamp) / 60_000);
        return mins < 1 ? "just now" : mins < 60 ? `${mins}m ago` : `${Math.round(mins / 60)}h ago`;
      })()
    : null;

  return (
    <div style={{ padding: "10px 0", borderBottom: `1px solid ${C.border}40` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, flexWrap: "wrap" }}>
        {sevCfg && (
          <span style={{ fontSize: 9, fontWeight: 800, color: sevCfg.tx, background: sevCfg.bg, border: `1px solid ${sevCfg.bd}`, borderRadius: 3, padding: "1px 6px", letterSpacing: 1, fontFamily: "monospace" }}>
            {sevCfg.label}
          </span>
        )}
        {item.waiver && (
          <span style={{ fontSize: 9, fontWeight: 800, color: C.accent, background: "#22C55E20", border: "1px solid #22C55E40", borderRadius: 3, padding: "1px 6px", letterSpacing: 1, fontFamily: "monospace" }}>📋 WAIVER</span>
        )}
        {ageLabel && (
          <span style={{ fontSize: 9, color: C.muted, fontFamily: "monospace", marginLeft: "auto" }}>{ageLabel}</span>
        )}
        <a href={src.url} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: src.color, fontFamily: "monospace", fontWeight: 700, textDecoration: "none", marginLeft: ageLabel ? 0 : "auto" }}>
          {src.label} ↗
        </a>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: severity !== "INFO" ? C.text : C.muted, lineHeight: 1.6 }}>
        {text}
      </p>
    </div>
  );
};
