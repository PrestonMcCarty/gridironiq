"use client";
import { C } from "@/lib/theme";
import { usePlayersCtx } from "@/hooks/usePlayersContext";
import { PLATFORM_LABELS } from "@/lib/league/LeagueModel";

const PLATFORM_COLORS = { sleeper: "#7C3AED", espn: "#EF4444", yahoo: "#5B21B6" };
const PLATFORM_ICONS  = { sleeper: "💤", espn: "🏈", yahoo: "Y!" };
const TYPE_COLORS     = { Redraft: C => C.accent, Dynasty: C => C.blue, Keeper: C => C.warning };

/**
 * Compact active-league pill shown in the nav header.
 * Clicking it navigates to the full Leagues page.
 * No dropdown — the Leagues page is the management surface.
 */
export const LeagueSelector = ({ onNavigateToLeagues }) => {
  const {
    leagues, activeLeague, leagueLoading, leagueLoaded,
  } = usePlayersCtx();

  if (!leagues.length) {
    return (
      <button
        onClick={onNavigateToLeagues}
        style={{
          background: "#22C55E15", border: "1px solid #22C55E40",
          borderRadius: 7, padding: "5px 12px",
          fontSize: 11, color: C.accent, cursor: "pointer", fontWeight: 700,
          flexShrink: 0, whiteSpace: "nowrap",
        }}>
        + Connect League
      </button>
    );
  }

  const platColor = activeLeague ? (PLATFORM_COLORS[activeLeague.platform] || C.accent) : C.accent;
  const typeColor = activeLeague ? (TYPE_COLORS[activeLeague.type]?.(C) || C.accent) : C.accent;

  return (
    <button
      onClick={onNavigateToLeagues}
      title="Manage leagues"
      style={{
        background: C.surface2, border: `1px solid ${C.border}`,
        borderRadius: 7, padding: "5px 10px",
        fontSize: 11, color: C.text, cursor: "pointer", fontWeight: 600,
        display: "flex", alignItems: "center", gap: 6,
        whiteSpace: "nowrap", maxWidth: 240, flexShrink: 0,
      }}>
      {/* Status dot */}
      <div style={{
        width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
        background: leagueLoading ? C.warning : leagueLoaded ? platColor : C.muted,
      }} />
      {/* Platform icon */}
      {activeLeague && (
        <span style={{ fontSize: 9, flexShrink: 0 }}>
          {PLATFORM_ICONS[activeLeague.platform]}
        </span>
      )}
      {/* League name */}
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", maxWidth: 130 }}>
        {activeLeague?.name ?? "Select League"}
      </span>
      {/* Type badge */}
      {activeLeague && (
        <span style={{
          fontSize: 9, fontFamily: "monospace", fontWeight: 700,
          color: typeColor, background: typeColor + "20",
          borderRadius: 3, padding: "1px 4px", flexShrink: 0,
        }}>
          {activeLeague.type}
        </span>
      )}
      {/* Chevron hint */}
      <span style={{ color: C.muted, fontSize: 9, flexShrink: 0 }}>▼</span>
    </button>
  );
};
