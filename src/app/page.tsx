"use client";
import { useState, useMemo, useCallback } from "react";
import { C } from "@/lib/theme";
import { DEFAULT_SETTINGS } from "@/lib/constants";
import { usePlayers }     from "@/hooks/usePlayers";
import { useLeagueStore } from "@/hooks/useLeagueStore";
import { PlayersCtx }     from "@/hooks/usePlayersContext";
import { PLATFORMS, PLATFORM_LABELS } from "@/lib/league/LeagueModel";
import { Logo }           from "@/components/ui/Logo";
import { Ticker }         from "@/components/ui/Ticker";
import { LeagueSelector } from "@/components/ui/LeagueSelector";
import {
  DraftIcon, LineupIcon, TradesIcon, TeamIcon,
  PlayersIcon, LeaguesIcon
} from "@/components/ui/Icons";
import { DraftPage }    from "@/components/pages/DraftPage";
import { LineupPage }   from "@/components/pages/LineupPage";
import { TradesPage }   from "@/components/pages/TradesPage";
import { TeamPage }     from "@/components/pages/TeamPage";
import { PlayersPage }  from "@/components/pages/PlayersPage";
import { LeaguesPage }  from "@/components/pages/LeaguesPage";
import { SettingsPanel }from "@/components/pages/SettingsPanel";

const NAV = [
  { id: "draft",   label: "Draft",    Icon: DraftIcon   },
  { id: "lineup",  label: "Lineup",   Icon: LineupIcon  },
  { id: "trades",  label: "Trades",   Icon: TradesIcon  },
  { id: "team",    label: "My Team",  Icon: TeamIcon    },
  { id: "players", label: "Players",  Icon: PlayersIcon },
  { id: "leagues", label: "Leagues",  Icon: LeaguesIcon },
];

export default function App() {
  const [page,         setPage]         = useState("draft");
  const [settings,     setSettings]     = useState(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);

  // ── Player pool ──────────────────────────────────────────────────────────
  const { players, loading, error, refresh, counts, historicalCoverage } = usePlayers(settings.scoring, settings.superflex);

  // ── Multi-platform league store ──────────────────────────────────────────
  const {
    leagues, activeLeagueId, activeLeague,
    rosters, users, transactions, matchups, draftPicks,
    leagueLoading, leagueError, leagueLoaded,
    myTeamId, myRosterId, myRosterIds,
    addLeague, addSleeperLeague, removeLeague, switchLeague,
    reloadLeague, refreshAuth,
  } = useLeagueStore();

  const findPlayer = useCallback(
    (id: string) => players.find((p: any) =>
      String(p.id) === String(id) || String(p.sleeperPlayerId) === String(id)
    ),
    [players]
  );

  // Legacy shim for TradesPage
  const legacyAddLeague = useCallback((id: string, uid: string | null, info: any) => {
    addSleeperLeague(id, uid, info);
  }, [addSleeperLeague]);

  const ctxValue = useMemo(() => ({
    players, loading, error, refresh, findPlayer, counts, historicalCoverage,
    leagues, activeLeagueId, activeLeague,
    addLeague, addSleeperLeague, removeLeague, switchLeague,
    PLATFORMS, PLATFORM_LABELS,
    rosters, users, transactions, matchups, draftPicks,
    leagueLoading, leagueError, leagueLoaded,
    reloadLeague, refreshAuth,
    myTeamId, myRosterId, myRosterIds,
    // Legacy API surface
    leagueId:     activeLeague?.platformLeagueId ?? "",
    leagueInfo:   activeLeague ?? null,
    setLeagueId:  () => {},
    setLeagueInfo:() => {},
    setUserId:    () => {},
    // UI (kept for any consumers that still read it)
    showLeagueManager: false,
    setShowLeagueManager: () => setPage("leagues"),
  }), [
    players, loading, error, refresh, findPlayer, counts, historicalCoverage,
    leagues, activeLeagueId, activeLeague,
    addLeague, addSleeperLeague, removeLeague, switchLeague,
    rosters, users, transactions, matchups, draftPicks,
    leagueLoading, leagueError, leagueLoaded, reloadLeague, refreshAuth,
    myTeamId, myRosterId, myRosterIds,
  ]);

  const pages: Record<string, React.ReactNode> = {
    draft:   <DraftPage   settings={settings} />,
    lineup:  <LineupPage  settings={settings} />,
    trades:  <TradesPage />,
    team:    <TeamPage    setPage={setPage} />,
    players: <PlayersPage />,
    leagues: <LeaguesPage />,
  };

  return (
    <PlayersCtx.Provider value={ctxValue}>
      <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "Inter, system-ui, sans-serif", color: C.text }}>

        {showSettings && (
          <SettingsPanel settings={settings} setSettings={setSettings} onClose={() => setShowSettings(false)} />
        )}

        <Ticker />

        <nav style={{ background: C.surface, borderBottom: `1px solid ${C.border}` }}>
          <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 12px", display: "flex", alignItems: "center", gap: 2, overflowX: "auto" }}>

            <div style={{ marginRight: 16, flexShrink: 0, padding: "10px 0" }}>
              <Logo />
            </div>

            {NAV.map(({ id, label, Icon }) => {
              const active = page === id;
              const isLeagues = id === "leagues";
              return (
                <button
                  key={id}
                  onClick={() => setPage(id)}
                  style={{
                    background: "none", border: "none", cursor: "pointer", flexShrink: 0,
                    padding: "14px 12px", display: "flex", alignItems: "center", gap: 6,
                    fontSize: 13, fontWeight: 600,
                    color: active ? C.accent : isLeagues && leagues.length === 0 ? C.warning : C.muted,
                    borderBottom: active ? `2px solid ${C.accent}` : "2px solid transparent",
                    transition: "all 0.15s",
                  }}>
                  <Icon c={active ? C.accent : isLeagues && leagues.length === 0 ? C.warning : C.muted} />
                  {label}
                  {/* Badge: connected league count */}
                  {isLeagues && leagues.length > 0 && (
                    <span style={{
                      background: active ? C.accent + "30" : C.surface2,
                      color: active ? C.accent : C.muted,
                      fontSize: 9, fontFamily: "monospace", fontWeight: 800,
                      borderRadius: 3, padding: "1px 5px",
                      border: `1px solid ${active ? C.accent + "40" : C.border}`,
                    }}>
                      {leagues.length}
                    </span>
                  )}
                </button>
              );
            })}

            {/* Right side: active-league pill + status + settings */}
            <div style={{ marginLeft: "auto", flexShrink: 0, display: "flex", alignItems: "center", gap: 8, paddingLeft: 12 }}>
              <LeagueSelector onNavigateToLeagues={() => setPage("leagues")} />

              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: loading ? C.warning : error ? C.danger : C.accent,
                  boxShadow: `0 0 6px ${loading ? C.warning : error ? C.danger : C.accent}`,
                  animation: loading ? "pulse 1s infinite" : "none",
                }} />
                <span style={{ fontSize: 10, color: C.muted, fontFamily: "monospace" }}>
                  {loading ? "LOADING" : error ? "ERROR" : "LIVE"}
                </span>
              </div>

              <button
                onClick={() => setShowSettings(true)}
                style={{
                  background: C.surface2, border: `1px solid ${C.border}`,
                  borderRadius: 7, padding: "5px 10px", fontSize: 11, color: C.muted,
                  cursor: "pointer", fontWeight: 600, flexShrink: 0,
                }}>
                ⚙ {settings.teams}T · {settings.scoring}
              </button>
            </div>
          </div>
        </nav>

        <main style={{ maxWidth: 1280, margin: "0 auto", padding: "22px 14px" }}>
          {pages[page]}
        </main>
      </div>
    </PlayersCtx.Provider>
  );
}
