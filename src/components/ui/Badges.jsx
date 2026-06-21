"use client";
import { C, posColor } from "@/lib/theme";

export const InjuryBadge = ({ status }) => {
  if (!status) return null;
  const m = {
    OUT: { bg: "#EF444420", bd: "#EF4444", tx: "#EF4444" },
    Q:   { bg: "#F59E0B20", bd: "#F59E0B", tx: "#F59E0B" },
    IR:  { bg: "#7C3AED20", bd: "#7C3AED", tx: "#7C3AED" },
  };
  const c = m[status] || m.Q;
  return (
    <span style={{ fontSize: 10, fontFamily: "monospace", fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: c.bg, border: `1px solid ${c.bd}`, color: c.tx, letterSpacing: 1 }}>
      {status}
    </span>
  );
};

export const PosBadge = ({ pos }) => {
  const col = posColor(pos);
  return (
    <span style={{ fontSize: 10, fontFamily: "monospace", fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: col + "22", color: col, border: `1px solid ${col}50` }}>
      {pos}
    </span>
  );
};

export const TrendIcon = ({ trend }) => (
  <span style={{ fontSize: 12, color: trend === "up" ? C.accent : trend === "down" ? C.danger : C.muted }}>
    {trend === "up" ? "▲" : trend === "down" ? "▼" : "─"}
  </span>
);

export const ConfidenceMeter = ({ value, size = "md" }) => {
  // Safety net: if upstream NaN reaches the display layer, show neutral state
  const safe = (typeof value === "number" && isFinite(value)) ? Math.min(100, Math.max(0, value)) : null;
  const col = safe == null ? C.muted
    : safe >= 75 ? C.accent
    : safe >= 55 ? C.blue
    : safe >= 40 ? C.warning
    : C.danger;
  const h = size === "sm" ? 4 : 6;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ flex: 1, height: h, background: C.border, borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${safe ?? 0}%`, background: col, borderRadius: 3, transition: "width 0.4s" }} />
      </div>
      <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 800, color: col, flexShrink: 0 }}>
        {safe != null ? `${safe}%` : "—"}
      </span>
    </div>
  );
};

export const IntelBar = ({ label, value, color }) => (
  <div style={{ marginBottom: 6 }}>
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
      <span style={{ fontSize: 9, color: C.muted, fontFamily: "monospace", letterSpacing: 1 }}>{label}</span>
      <span style={{ fontSize: 9, fontFamily: "monospace", fontWeight: 700, color }}>{value}</span>
    </div>
    <div style={{ height: 3, background: C.border, borderRadius: 2, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${value}%`, background: color, borderRadius: 2 }} />
    </div>
  </div>
);

export const Skeleton = ({ h = 14, w = "100%", mb = 8 }) => (
  <div style={{ height: h, width: w, background: C.surface2, borderRadius: 4, marginBottom: mb, animation: "pulse 1.4s ease-in-out infinite", opacity: 0.7 }} />
);
