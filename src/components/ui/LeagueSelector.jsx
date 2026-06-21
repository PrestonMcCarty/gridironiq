"use client";
import { useState, useRef, useEffect } from "react";
import { C } from "@/lib/theme";
import { usePlayersCtx } from "@/hooks/usePlayersContext";
import { PLATFORM_LABELS } from "@/lib/league/LeagueModel";

const PLATFORM_COLORS = { sleeper: "#7C3AED", espn: "#EF4444", yahoo: "#5B21B6" };
const PLATFORM_ICONS  = { sleeper: "💤", espn: "🏈", yahoo: "Y!" };
const TYPE_COLORS     = { Redraft: C => C.accent, Dynasty: C => C.blue, Keeper: C => C.warning };

export const LeagueSelector = () => {
  const {
    leagues, activeLeague, activeLeagueId,
    switchLeague, removeLeague, leagueLoading, leagueLoaded,
    setShowLeagueManager,
  } = usePlayersCtx();

  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  if (!leagues.length) {
    return (
      <button onClick={() => setShowLeagueManager(true)}
        style={{ background: "#22C55E15", border: "1px solid #22C55E40", borderRadius: 7, padding: "5px 12px", fontSize: 11, color: C.accent, cursor: "pointer", fontWeight: 700, flexShrink: 0 }}>
        + Connect League
      </button>
    );
  }

  const platColor = activeLeague ? (PLATFORM_COLORS[activeLeague.platform] || C.accent) : C.accent;
  const typeColor = activeLeague ? (TYPE_COLORS[activeLeague.type]?.(C) || C.accent) : C.accent;

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button onClick={() => setOpen(v => !v)}
        style={{ background: C.surface2, border: `1px solid ${open ? C.accent + "60" : C.border}`, borderRadius: 7, padding: "5px 10px", fontSize: 11, color: C.text, cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", maxWidth: 240 }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: leagueLoading ? C.warning : leagueLoaded ? platColor : C.muted, flexShrink: 0 }} />
        {activeLeague && (
          <span style={{ fontSize: 9, color: platColor, flexShrink: 0 }}>
            {PLATFORM_ICONS[activeLeague.platform]}
          </span>
        )}
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", maxWidth: 130 }}>
          {activeLeague?.name ?? "Select League"}
        </span>
        {activeLeague && (
          <span style={{ fontSize: 9, fontFamily: "monospace", color: typeColor, background: typeColor + "20", borderRadius: 3, padding: "1px 4px", flexShrink: 0 }}>
            {activeLeague.type}
          </span>
        )}
        <span style={{ color: C.muted, fontSize: 9, flexShrink: 0 }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, minWidth: 280, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: "0 8px 24px #00000060", zIndex: 1000, overflow: "hidden" }}>
          <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: C.muted, fontFamily: "monospace", letterSpacing: 1.5 }}>MY LEAGUES</span>
            <button onClick={() => { setOpen(false); setShowLeagueManager(true); }}
              style={{ background: "#22C55E15", border: "1px solid #22C55E40", borderRadius: 5, padding: "2px 8px", fontSize: 10, color: C.accent, cursor: "pointer", fontWeight: 700 }}>
              + Add
            </button>
          </div>

          {leagues.map(league => {
            const isActive = league.id === activeLeagueId;
            const pc = PLATFORM_COLORS[league.platform] || C.muted;
            const tc = TYPE_COLORS[league.type]?.(C) || C.accent;
            return (
              <div key={league.id}
                onClick={() => { switchLeague(league.id); setOpen(false); }}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${C.border}`, background: isActive ? "#22C55E08" : "transparent", cursor: "pointer" }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "#ffffff06"; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}>
                <div style={{ width: 14, textAlign: "center", flexShrink: 0 }}>
                  {isActive && <span style={{ color: C.accent, fontSize: 11 }}>✓</span>}
                </div>
                <span style={{ fontSize: 11, flexShrink: 0 }}>{PLATFORM_ICONS[league.platform]}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: isActive ? 700 : 500, color: isActive ? C.text : C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {league.name}
                  </div>
                  <div style={{ fontSize: 9, color: C.muted, fontFamily: "monospace", marginTop: 1 }}>
                    {PLATFORM_LABELS[league.platform]} · {league.totalTeams} teams · {league.season}
                  </div>
                </div>
                <span style={{ fontSize: 9, fontFamily: "monospace", color: tc, background: tc + "20", borderRadius: 3, padding: "1px 4px", flexShrink: 0 }}>{league.type}</span>
                <button onClick={e => { e.stopPropagation(); removeLeague(league.id); }}
                  style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 13, lineHeight: 1, padding: "0 2px", opacity: 0.5 }} title="Remove">×</button>
              </div>
            );
          })}

          <div style={{ padding: "8px 14px" }}>
            <div style={{ fontSize: 9, color: C.muted, fontFamily: "monospace" }}>
              Sleeper · ESPN · Yahoo · Switch without reconnecting
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
