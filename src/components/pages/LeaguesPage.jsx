"use client";
import { useState } from "react";
import { C } from "@/lib/theme";
import { SyncIcon, CloseIcon } from "@/components/ui/Icons";
import { SleeperAdapter } from "@/lib/league/adapters/SleeperAdapter";
import { usePlayersCtx } from "@/hooks/usePlayersContext";
import { PLATFORMS, PLATFORM_LABELS } from "@/lib/league/LeagueModel";

// ── Constants ─────────────────────────────────────────────────────────────────
const PLATFORM_COLORS  = { sleeper: "#7C3AED", espn: "#EF4444",  yahoo: "#5B21B6" };
const PLATFORM_ICONS   = { sleeper: "💤",       espn: "🏈",       yahoo: "Y!" };
const TYPE_COLORS      = { Redraft: "#22C55E",  Dynasty: "#3B82F6", Keeper: "#F59E0B" };

function timeAgo(ts) {
  if (!ts) return "Never";
  const mins = Math.floor((Date.now() - ts) / 60_000);
  if (mins < 1)   return "Just now";
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs  < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── League Card ───────────────────────────────────────────────────────────────
const LeagueCard = ({ league, isActive, onSetActive, onSync, onRemove, isLoading }) => {
  const platColor = PLATFORM_COLORS[league.platform] || C.muted;
  const typeColor = TYPE_COLORS[league.type]         || C.accent;
  const syncOk    = league.lastRefreshed && (Date.now() - league.lastRefreshed) < 24 * 3_600_000;
  const hasCoverage = (league.myRosterIds || []).length > 0;

  return (
    <div style={{
      background: C.surface,
      borderRadius: 14,
      border: `1px solid ${isActive ? C.accent + "60" : C.border}`,
      padding: 20,
      position: "relative",
      transition: "border-color 0.2s",
      display: "flex",
      flexDirection: "column",
      gap: 14,
    }}>
      {/* Active badge */}
      {isActive && (
        <div style={{ position: "absolute", top: 14, right: 14, fontSize: 9, fontWeight: 800, color: C.accent, background: "#22C55E20", border: "1px solid #22C55E40", borderRadius: 4, padding: "2px 7px", fontFamily: "monospace", letterSpacing: 1 }}>
          ACTIVE
        </div>
      )}

      {/* Header row */}
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        {/* Platform icon */}
        <div style={{ width: 42, height: 42, borderRadius: 10, background: platColor + "20", border: `1px solid ${platColor}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
          {PLATFORM_ICONS[league.platform]}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: isActive ? 70 : 0 }}>
            {league.name}
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 3, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span style={{ color: platColor, fontWeight: 600 }}>{PLATFORM_LABELS[league.platform]}</span>
            <span>·</span>
            <span>{league.season}</span>
            <span>·</span>
            <span>{league.totalTeams} teams</span>
          </div>
        </div>
      </div>

      {/* Type + record row */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, fontFamily: "monospace", fontWeight: 700, color: typeColor, background: typeColor + "18", borderRadius: 4, padding: "2px 7px" }}>
          {league.type}
        </span>
        <span style={{ fontSize: 10, fontFamily: "monospace", color: C.muted, background: C.surface2, borderRadius: 4, padding: "2px 7px" }}>
          {league.scoring || "PPR"}
        </span>
        {league.myRosterIds?.length > 0 && (
          <span style={{ fontSize: 10, fontFamily: "monospace", color: C.accent, background: "#22C55E15", borderRadius: 4, padding: "2px 7px" }}>
            {league.myRosterIds.length} players
          </span>
        )}
      </div>

      {/* Health indicators */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
        {/* Sync status */}
        <div style={{ display: "flex", alignItems: "center", gap: 5, flex: 1 }}>
          <div style={{
            width: 6, height: 6, borderRadius: "50%",
            background: syncOk ? C.accent : league.lastRefreshed ? C.warning : C.danger,
            flexShrink: 0,
          }} />
          <span style={{ fontSize: 10, color: C.muted }}>
            {isLoading ? "Syncing…" : `Synced ${timeAgo(league.lastRefreshed)}`}
          </span>
        </div>

        {/* Roster warning */}
        {!hasCoverage && (
          <div style={{ fontSize: 9, color: C.warning, fontFamily: "monospace", background: "#F59E0B15", borderRadius: 4, padding: "2px 6px" }}>
            ⚠ No roster
          </div>
        )}

        {/* User ID warning */}
        {!league.userId && (
          <div style={{ fontSize: 9, color: C.danger, fontFamily: "monospace", background: "#EF444415", borderRadius: 4, padding: "2px 6px" }}>
            ⚠ No user ID
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {!isActive && (
          <button
            onClick={onSetActive}
            style={{ flex: "1 1 auto", background: "#22C55E20", border: "1px solid #22C55E50", borderRadius: 7, padding: "7px 12px", fontSize: 11, fontWeight: 700, color: C.accent, cursor: "pointer" }}>
            Set Active
          </button>
        )}
        {isActive && (
          <div style={{ flex: "1 1 auto", background: "#22C55E10", border: "1px solid #22C55E30", borderRadius: 7, padding: "7px 12px", fontSize: 11, fontWeight: 700, color: C.accent, textAlign: "center" }}>
            ✓ Active League
          </div>
        )}
        <button
          onClick={onSync}
          disabled={isLoading}
          title="Sync league data"
          style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 7, padding: "7px 10px", fontSize: 11, color: C.muted, cursor: isLoading ? "default" : "pointer", opacity: isLoading ? 0.5 : 1 }}>
          <SyncIcon c={C.muted} />
        </button>
        <button
          onClick={onRemove}
          title="Remove league"
          style={{ background: "#EF444410", border: "1px solid #EF444430", borderRadius: 7, padding: "7px 10px", fontSize: 11, color: C.danger, cursor: "pointer" }}>
          ✕
        </button>
      </div>
    </div>
  );
};

// ── Connect Panel ─────────────────────────────────────────────────────────────
const ConnectPanel = () => {
  const { addSleeperLeague, addLeague, PLATFORMS: P } = usePlayersCtx();

  const [platform,     setPlatform]     = useState("sleeper");
  const [username,     setUsername]     = useState("");
  const [leagueId,     setLeagueId]     = useState("");
  const [espnLeagueId, setEspnLeagueId] = useState("");
  const [espnS2,       setEspnS2]       = useState("");
  const [swid,         setSwid]         = useState("");
  const [yahooToken,   setYahooToken]   = useState("");
  const [found,        setFound]        = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState(null);
  const [success,      setSuccess]      = useState(null);

  const reset = () => { setError(null); setSuccess(null); setFound([]); };

  // Sleeper: League ID + username required. Resolves user_id, verifies membership,
  // then stores the league. Throws before import if user is not in the league.
  const connectSleeper = async () => {
    if (!leagueId.trim())  { setError("Enter your Sleeper League ID."); return; }
    if (!username.trim())  { setError("Enter your Sleeper username."); return; }
    setLoading(true); reset();
    try {
      const user = await SleeperAdapter.getUserByUsername(username.trim());
      await SleeperAdapter.verifyMembership(leagueId.trim(), user.user_id);
      const info = await SleeperAdapter.getLeagueInfo(leagueId.trim());
      await addSleeperLeague(leagueId.trim(), user.user_id, info);
      setSuccess(`"${info.name}" connected!`);
      setLeagueId(""); setUsername("");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const connectESPN = async () => {
    if (!espnLeagueId.trim()) { setError("Enter your ESPN League ID"); return; }
    setLoading(true); reset();
    try {
      const { ESPNAdapter } = await import("@/lib/league/adapters/ESPNAdapter");
      const info = await ESPNAdapter.getLeagueInfo(espnLeagueId.trim(), { espn_s2: espnS2 || undefined, SWID: swid || undefined });
      await addLeague(PLATFORMS.ESPN, { espn_s2: espnS2 || undefined, SWID: swid || undefined }, info);
      setSuccess(`ESPN "${info.name}" connected!`);
      setEspnLeagueId(""); setEspnS2(""); setSwid("");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const connectYahooWithToken = async () => {
    if (!yahooToken.trim()) { setError("Paste your Yahoo access token"); return; }
    setLoading(true); reset();
    try {
      const { YahooAdapter } = await import("@/lib/league/adapters/YahooAdapter");
      const results = await YahooAdapter.getLeaguesForUser({ accessToken: yahooToken.trim() });
      if (!results.length) { setError("No Yahoo leagues found"); return; }
      setFound(results.map(l => ({ ...l, _accessToken: yahooToken.trim() })));
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const connectYahooFound = async (info) => {
    setLoading(true); reset();
    try {
      await addLeague(PLATFORMS.YAHOO, { accessToken: info._accessToken }, info);
      setSuccess(`Yahoo "${info.name}" connected!`);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const inputStyle = { background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", color: C.text, fontSize: 12, outline: "none", width: "100%" };

  return (
    <div style={{ background: C.surface, borderRadius: 14, border: `1px solid ${C.border}`, padding: 24 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: C.text, marginBottom: 4 }}>Connect a League</div>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 18 }}>Supports Sleeper, ESPN, and Yahoo Fantasy</div>

      {/* Platform tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 18 }}>
        {[
          { id: PLATFORMS.SLEEPER, label: "💤 Sleeper",      col: PLATFORM_COLORS.sleeper },
          { id: PLATFORMS.ESPN,    label: "🏈 ESPN",          col: PLATFORM_COLORS.espn   },
          { id: PLATFORMS.YAHOO,   label: "Y! Yahoo",        col: PLATFORM_COLORS.yahoo  },
        ].map(p => (
          <button key={p.id} onClick={() => { setPlatform(p.id); reset(); setFound([]); }}
            style={{ flex: 1, background: platform === p.id ? p.col + "22" : C.surface2, border: `1px solid ${platform === p.id ? p.col : C.border}`, borderRadius: 8, padding: "8px 4px", fontSize: 10, fontWeight: 700, color: platform === p.id ? p.col : C.muted, cursor: "pointer" }}>
            {p.label}
          </button>
        ))}
      </div>

      {/* Sleeper: League ID + username, both required */}
      {platform === PLATFORMS.SLEEPER && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input value={leagueId} onChange={e => setLeagueId(e.target.value)}
            placeholder="Sleeper League ID (from URL)" style={inputStyle} />
          <div style={{ display: "flex", gap: 8 }}>
            <input value={username} onChange={e => setUsername(e.target.value)}
              onKeyDown={e => e.key === "Enter" && connectSleeper()}
              placeholder="Your Sleeper username" style={inputStyle} />
            <button onClick={connectSleeper} disabled={loading}
              style={{ background: "#22C55E22", border: "1px solid #22C55E50", borderRadius: 8, padding: "8px 16px", fontSize: 12, color: C.accent, cursor: "pointer", fontWeight: 700, whiteSpace: "nowrap", opacity: loading ? 0.6 : 1 }}>
              {loading ? "…" : "Connect"}
            </button>
          </div>
          <div style={{ fontSize: 10, color: C.muted }}>
            URL format: <span style={{ fontFamily: "monospace", color: C.text }}>sleeper.com/leagues/<span style={{ color: C.accent }}>LEAGUE_ID</span></span>
          </div>
        </div>
      )}

      {/* ESPN */}
      {platform === PLATFORMS.ESPN && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ background: "#EF444410", border: "1px solid #EF444425", borderRadius: 8, padding: "10px 12px", fontSize: 10, color: C.muted, lineHeight: 1.6 }}>
            <strong style={{ color: "#EF4444" }}>Private leagues:</strong> Get <code style={{ color: C.text }}>espn_s2</code> and <code style={{ color: C.text }}>SWID</code> from browser DevTools → Application → Cookies. Public leagues need no cookies.
          </div>
          <input value={espnLeagueId} onChange={e => setEspnLeagueId(e.target.value)} placeholder="ESPN League ID (from URL)" style={inputStyle} />
          <input value={espnS2} onChange={e => setEspnS2(e.target.value)} placeholder="espn_s2 cookie (optional)" style={inputStyle} />
          <input value={swid} onChange={e => setSwid(e.target.value)} placeholder="SWID cookie (optional)" style={inputStyle} />
          <button onClick={connectESPN} disabled={loading || !espnLeagueId.trim()}
            style={{ background: "#EF444422", border: "1px solid #EF444450", borderRadius: 8, padding: "9px", fontSize: 12, color: "#EF4444", cursor: "pointer", fontWeight: 700, opacity: loading ? 0.6 : 1 }}>
            {loading ? "Connecting…" : "Connect ESPN League"}
          </button>
        </div>
      )}

      {/* Yahoo */}
      {platform === PLATFORMS.YAHOO && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ background: "#5B21B610", border: "1px solid #5B21B625", borderRadius: 8, padding: "10px 12px", fontSize: 10, color: C.muted, lineHeight: 1.6 }}>
            <strong style={{ color: "#7C3AED" }}>Yahoo OAuth:</strong> Requires <code style={{ color: C.text }}>YAHOO_CLIENT_ID</code> in .env.local. See <a href="https://developer.yahoo.com/apps/" target="_blank" rel="noreferrer" style={{ color: "#7C3AED" }}>developer.yahoo.com/apps</a>.
          </div>
          <button onClick={() => {
            const id = process.env.NEXT_PUBLIC_YAHOO_CLIENT_ID;
            if (!id) { setError("NEXT_PUBLIC_YAHOO_CLIENT_ID not set in .env.local"); return; }
            const params = new URLSearchParams({ client_id: id, redirect_uri: `${window.location.origin}/api/yahoo`, response_type: "code", scope: "fspt-r" });
            window.location.href = `https://api.login.yahoo.com/oauth2/request_auth?${params}`;
          }}
            style={{ background: "#5B21B622", border: "1px solid #5B21B650", borderRadius: 8, padding: "9px", fontSize: 12, color: "#7C3AED", cursor: "pointer", fontWeight: 700 }}>
            Connect with Yahoo →
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, height: 1, background: C.border }} />
            <span style={{ fontSize: 10, color: C.muted }}>or paste access token</span>
            <div style={{ flex: 1, height: 1, background: C.border }} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={yahooToken} onChange={e => setYahooToken(e.target.value)} placeholder="Yahoo access token" style={inputStyle} />
            <button onClick={connectYahooWithToken} disabled={loading || !yahooToken.trim()}
              style={{ background: "#5B21B622", border: "1px solid #5B21B650", borderRadius: 8, padding: "8px 14px", fontSize: 12, color: "#7C3AED", cursor: "pointer", fontWeight: 700, whiteSpace: "nowrap", opacity: loading ? 0.6 : 1 }}>
              {loading ? "…" : "Find Leagues"}
            </button>
          </div>
          {found.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {found.map(l => (
                <button key={l.platformLeagueId} onClick={() => connectYahooFound(l)}
                  style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", display: "flex", justifyContent: "space-between", cursor: "pointer" }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{l.name}</div>
                    <div style={{ fontSize: 10, color: C.muted, fontFamily: "monospace", marginTop: 2 }}>{l.totalTeams} teams · {l.season}</div>
                  </div>
                  <span style={{ color: "#7C3AED", fontSize: 16 }}>+</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {error   && <div style={{ fontSize: 11, color: C.danger, marginTop: 12, fontFamily: "monospace" }}>⚠ {error}</div>}
      {success && <div style={{ fontSize: 11, color: C.accent, marginTop: 12, fontFamily: "monospace" }}>✓ {success}</div>}
    </div>
  );
};

// ── Main Leagues Page ─────────────────────────────────────────────────────────
export const LeaguesPage = () => {
  const {
    leagues, activeLeagueId, activeLeague,
    switchLeague, removeLeague, reloadLeague,
    leagueLoading,
  } = usePlayersCtx();

  const [syncingId, setSyncingId] = useState(null);

  const handleSync = async (leagueId) => {
    setSyncingId(leagueId);
    if (leagueId === activeLeagueId) {
      await reloadLeague();
    } else {
      // Switch to league, let the store load it, switch back
      // (simpler: store syncs on switch)
      switchLeague(leagueId);
    }
    setSyncingId(null);
  };

  return (
    <div>
      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 900, color: C.text, margin: 0, letterSpacing: -0.5 }}>
          My Leagues
        </h1>
        <p style={{ color: C.muted, fontSize: 12, margin: "5px 0 0" }}>
          Manage connected leagues · Switch active league · All tools update instantly
        </p>
      </div>

      {/* Active league banner */}
      {activeLeague && (
        <div style={{ background: "#22C55E08", border: "1px solid #22C55E30", borderRadius: 12, padding: "14px 18px", marginBottom: 22, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.accent, boxShadow: `0 0 8px ${C.accent}` }} />
          <div>
            <span style={{ fontSize: 11, color: C.muted }}>Currently active: </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{activeLeague.name}</span>
            <span style={{ fontSize: 11, color: C.muted }}> · {PLATFORM_LABELS[activeLeague.platform]} · {activeLeague.season}</span>
          </div>
          <div style={{ marginLeft: "auto", fontSize: 10, color: C.muted }}>
            All tools are using this league
          </div>
        </div>
      )}

      {/* Two-column layout: league cards | connect panel */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,380px)", gap: 20, alignItems: "start" }}>

        {/* Left: league cards */}
        <div>
          {leagues.length === 0 ? (
            <div style={{ background: C.surface, borderRadius: 14, border: `1px dashed ${C.border}`, padding: 48, textAlign: "center" }}>
              <div style={{ fontSize: 36, marginBottom: 14 }}>🏈</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 8 }}>No leagues connected yet</div>
              <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.7, maxWidth: 320, margin: "0 auto" }}>
                Connect your Sleeper, ESPN, or Yahoo Fantasy league on the right.
                All tools — Draft, Lineup, Trade Finder, My Team — will use your active league automatically.
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: C.muted, fontFamily: "monospace", letterSpacing: 1.5, marginBottom: 4 }}>
                {leagues.length} CONNECTED LEAGUE{leagues.length !== 1 ? "S" : ""}
              </div>
              {leagues.map(league => (
                <LeagueCard
                  key={league.id}
                  league={league}
                  isActive={league.id === activeLeagueId}
                  isLoading={(leagueLoading && league.id === activeLeagueId) || syncingId === league.id}
                  onSetActive={() => switchLeague(league.id)}
                  onSync={() => handleSync(league.id)}
                  onRemove={() => {
                    if (confirm(`Remove "${league.name}"?`)) removeLeague(league.id);
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right: connect panel (sticky) */}
        <div style={{ position: "sticky", top: 20 }}>
          <ConnectPanel />
          <div style={{ marginTop: 14, background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, padding: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: C.muted, fontFamily: "monospace", letterSpacing: 1, marginBottom: 10 }}>HOW IT WORKS</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { n: "1", t: "Connect your league", d: "Paste your username or league ID" },
                { n: "2", t: "Set as active",        d: "Click any league card to make it active" },
                { n: "3", t: "All tools update",     d: "Draft, Lineup, Trades, My Team use your roster" },
                { n: "4", t: "Switch anytime",       d: "Manage multiple leagues seamlessly" },
              ].map(s => (
                <div key={s.n} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#22C55E20", border: "1px solid #22C55E40", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: C.accent, flexShrink: 0 }}>
                    {s.n}
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.text }}>{s.t}</div>
                    <div style={{ fontSize: 10, color: C.muted }}>{s.d}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
