"use client";
import { useMemo } from "react";
import { C } from "@/lib/theme";
import { usePlayersCtx } from "@/hooks/usePlayersContext";

export const Ticker = () => {
  const { players } = usePlayersCtx();
  const items = useMemo(() => {
    const inj = players.filter(p => p.injury).slice(0, 10)
      .map(p => `${p.injury === "OUT" ? "🔴" : p.injury === "IR" ? "🟣" : "🟡"} ${p.name} — ${p.injury}${p.injuryDetail ? ` (${p.injuryDetail.type})` : ""}`);
    const brk = players.flatMap(p => p.news || []).filter(n => n.urgency === "breaking").slice(0, 8)
      .map(n => `⚡ ${n.text}`);
    const trd = players.filter(p => p.trend === "up" && !p.injury).slice(0, 5)
      .map(p => `▲ ${p.name} trending — ${p.last4Avg?.toFixed(1) || p.ppg} PPG last 4`);
    return [...inj, ...brk, ...trd];
  }, [players]);

  if (!items.length) {
    return (
      <div style={{ background: "#0D1525", borderBottom: `1px solid ${C.border}`, padding: "5px 14px" }}>
        <span style={{ fontSize: 11, color: C.muted, fontFamily: "monospace" }}>
          Loading intelligence data from Sleeper & FantasyCalc…
        </span>
      </div>
    );
  }

  return (
    <div style={{ background: "#0D1525", borderBottom: `1px solid ${C.border}`, padding: "5px 0", overflow: "hidden", whiteSpace: "nowrap" }}>
      <span className="tk" style={{ fontSize: 11, color: C.muted, fontFamily: "monospace" }}>
        {items.join("     ·     ")}
      </span>
    </div>
  );
};
