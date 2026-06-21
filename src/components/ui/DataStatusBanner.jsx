"use client";
import { C } from "@/lib/theme";
import { SyncIcon } from "@/components/ui/Icons";

export const DataStatusBanner = ({ source, loading, error, playerCount, counts = {}, refresh }) => {
  if (loading) return (
    <div style={{ background: "#22C55E08", border: "1px solid #22C55E30", borderRadius: 8, padding: "8px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.accent, animation: "pulse 1s infinite" }} />
      <span style={{ fontSize: 11, color: C.accent, fontFamily: "monospace" }}>Loading player database from Sleeper API…</span>
    </div>
  );
  if (error) return (
    <div style={{ background: "#EF444408", border: "1px solid #EF444430", borderRadius: 8, padding: "8px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 11, color: C.danger, fontFamily: "monospace" }}>⚠ API unavailable — {error}</span>
      <button onClick={refresh} style={{ marginLeft: "auto", background: "none", border: `1px solid ${C.danger}`, borderRadius: 5, padding: "2px 8px", fontSize: 10, color: C.danger, cursor: "pointer" }}>Retry</button>
    </div>
  );

  const hasCounts = Object.keys(counts).length > 0;
  return (
    <div style={{ background: "#22C55E08", border: "1px solid #22C55E20", borderRadius: 8, padding: "6px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.accent, boxShadow: `0 0 5px ${C.accent}`, flexShrink: 0 }} />
      <span style={{ fontSize: 10, color: C.muted, fontFamily: "monospace" }}>
        LIVE · <span style={{ color: C.accent, fontWeight: 700 }}>{playerCount}</span> players
        {hasCounts && (
          <span style={{ color: C.muted }}>
            {" "}·{" "}
            <span style={{ color: "#3B82F6" }}>QB:{counts.QB ?? "—"}</span>{" "}
            <span style={{ color: "#22C55E" }}>RB:{counts.RB ?? "—"}</span>{" "}
            <span style={{ color: "#A855F7" }}>WR:{counts.WR ?? "—"}</span>{" "}
            <span style={{ color: "#F59E0B" }}>TE:{counts.TE ?? "—"}</span>{" "}
            <span style={{ color: "#6B7280" }}>K:{counts.K ?? "—"}</span>{" "}
            <span style={{ color: "#EF4444" }}>DST:{counts.DST ?? "—"}</span>
            {counts.FA > 0 && <span style={{ color: C.muted }}> · FA:{counts.FA}</span>}
            {counts.IR > 0 && <span style={{ color: "#EF4444" }}> · IR:{counts.IR}</span>}
          </span>
        )}
        {" "}· Sleeper + FantasyCalc
      </span>
      <button onClick={refresh} style={{ marginLeft: "auto", background: "none", border: `1px solid ${C.border}`, borderRadius: 5, padding: "2px 8px", fontSize: 10, color: C.muted, cursor: "pointer" }}>
        <SyncIcon c={C.muted} />
      </button>
    </div>
  );
};
