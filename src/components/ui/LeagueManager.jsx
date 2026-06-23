"use client";
import { useState } from "react";
import { C } from "@/lib/theme";
import { CloseIcon } from "@/components/ui/Icons";
import { SleeperAdapter } from "@/lib/league/adapters/SleeperAdapter";
import { usePlayersCtx } from "@/hooks/usePlayersContext";
import { PLATFORMS, PLATFORM_LABELS } from "@/lib/league/LeagueModel";

const PLATFORM_COLORS = {
  sleeper: "#7C3AED",
  espn:    "#EF4444",
  yahoo:   "#5B21B6",
};

const PLATFORM_ICONS = {
  sleeper: "💤",
  espn:    "🏈",
  yahoo:   "Y!",
};

export const LeagueManager = () => {
  const {
    leagues, activeLeagueId,
    addSleeperLeague, addLeague, removeLeague, switchLeague,
    setShowLeagueManager, PLATFORMS: P,
  } = usePlayersCtx();

  const [platform,     setPlatform]     = useState("sleeper");
  const [username,     setUsername]     = useState("");
  const [leagueId,     setLeagueId]     = useState("");
  const [espnS2,       setEspnS2]       = useState("");
  const [swid,         setSwid]         = useState("");
  const [espnLeagueId, setEspnLeagueId] = useState("");
  const [yahooToken,   setYahooToken]   = useState("");
  const [found,        setFound]        = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState(null);
  const [success,      setSuccess]      = useState(null);

  const reset = () => { setError(null); setSuccess(null); setFound([]); };

  // Sleeper: connect by League ID + username (both required)
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

  // ESPN: connect by League ID
  const connectESPN = async () => {
    if (!espnLeagueId.trim()) { setError("Enter your ESPN League ID"); return; }
    setLoading(true); reset();
    try {
      const { ESPNAdapter } = await import("@/lib/league/adapters/ESPNAdapter");
      const info = await ESPNAdapter.getLeagueInfo(
        espnLeagueId.trim(),
        { espn_s2: espnS2.trim() || undefined, SWID: swid.trim() || undefined }
      );
      await addLeague(PLATFORMS.ESPN, {
        espn_s2: espnS2.trim() || undefined,
        SWID:    swid.trim()   || undefined,
      }, info);
      setSuccess(`ESPN "${info.name}" connected!`);
      setEspnLeagueId(""); setEspnS2(""); setSwid("");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  // Yahoo: initiate OAuth flow
  const startYahooOAuth = () => {
    const clientId = process.env.NEXT_PUBLIC_YAHOO_CLIENT_ID;
    if (!clientId) {
      setError("Yahoo OAuth not configured. Add NEXT_PUBLIC_YAHOO_CLIENT_ID to .env.local");
      return;
    }
    const params = new URLSearchParams({
      client_id:     clientId,
      redirect_uri:  `${window.location.origin}/api/yahoo/callback`,
      response_type: "code",
      scope:         "fspt-r",
      language:      "en-us",
    });
    window.location.href = `https://api.login.yahoo.com/oauth2/request_auth?${params}`;
  };

  // Yahoo: connect with access token
  const connectYahooWithToken = async () => {
    if (!yahooToken.trim()) { setError("Paste your Yahoo access token"); return; }
    setLoading(true); reset();
    try {
      const { YahooAdapter } = await import("@/lib/league/adapters/YahooAdapter");
      const results = await YahooAdapter.getLeaguesForUser({ accessToken: yahooToken.trim() });
      if (!results.length) { setError("No Yahoo fantasy football leagues found"); return; }
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

  const alreadyAdded = (platformLeagueId, plt) =>
    leagues.some(l => l.platformLeagueId === String(platformLeagueId) && l.platform === plt);

  const typeColor = (t) => t === "Dynasty" ? C.blue : t === "Keeper" ? C.warning : C.accent;

  return (
    <div onClick={() => setShowLeagueManager(false)}
      style={{ position: "fixed", inset: 0, background: "#000000c0", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: C.surface, borderRadius: 16, border: `1px solid ${C.border}`, width: "100%", maxWidth: 560, maxHeight: "90vh", display: "flex", flexDirection: "column" }}>

        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: C.text }}>League Connector</h2>
            <p style={{ margin: "2px 0 0", fontSize: 11, color: C.muted }}>Connect Sleeper · ESPN · Yahoo Fantasy</p>
          </div>
          <button onClick={() => setShowLeagueManager(false)} style={{ background: "none", border: "none", cursor: "pointer" }}>
            <CloseIcon c={C.muted} />
          </button>
        </div>

        <div style={{ overflowY: "auto", flex: 1 }}>
          {leagues.length > 0 && (
            <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: C.muted, fontFamily: "monospace", letterSpacing: 1.5, marginBottom: 10 }}>
                CONNECTED LEAGUES ({leagues.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {leagues.map(league => {
                  const isActive  = league.id === activeLeagueId;
                  const platColor = PLATFORM_COLORS[league.platform] || C.muted;
                  const tc        = typeColor(league.type);
                  return (
                    <div key={league.id}
                      onClick={() => { switchLeague(league.id); setShowLeagueManager(false); }}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: isActive ? "#22C55E08" : C.surface2, borderRadius: 8, border: `1px solid ${isActive ? C.accent + "40" : C.border}`, cursor: "pointer" }}>
                      <div style={{ width: 14, textAlign: "center" }}>
                        {isActive ? <span style={{ color: C.accent }}>✓</span> : <div style={{ width: 10, height: 10, borderRadius: "50%", border: `1px solid ${C.border}` }} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: isActive ? 700 : 500, color: isActive ? C.text : C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {league.name}
                        </div>
                        <div style={{ fontSize: 9, color: C.muted, fontFamily: "monospace", marginTop: 1 }}>
                          {league.totalTeams} teams · {league.season} · {PLATFORM_LABELS[league.platform]}
                        </div>
                      </div>
                      <span style={{ fontSize: 9, fontFamily: "monospace", color: platColor, background: platColor + "20", borderRadius: 3, padding: "1px 5px", flexShrink: 0 }}>
                        {PLATFORM_ICONS[league.platform]} {PLATFORM_LABELS[league.platform]}
                      </span>
                      <span style={{ fontSize: 9, fontFamily: "monospace", color: tc, background: tc + "20", borderRadius: 3, padding: "1px 5px", flexShrink: 0 }}>
                        {league.type}
                      </span>
                      {isActive && <span style={{ fontSize: 9, color: C.accent, fontFamily: "monospace", background: "#22C55E20", borderRadius: 3, padding: "1px 5px" }}>ACTIVE</span>}
                      <button onClick={e => { e.stopPropagation(); removeLeague(league.id); }}
                        style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "0 2px", opacity: 0.5 }}>×</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ padding: "14px 20px" }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: C.muted, fontFamily: "monospace", letterSpacing: 1.5, marginBottom: 12 }}>ADD A LEAGUE</div>

            <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
              {[
                { id: PLATFORMS.SLEEPER, label: "💤 Sleeper",       color: PLATFORM_COLORS.sleeper },
                { id: PLATFORMS.ESPN,    label: "🏈 ESPN",           color: PLATFORM_COLORS.espn    },
                { id: PLATFORMS.YAHOO,   label: "Y! Yahoo Fantasy",  color: PLATFORM_COLORS.yahoo   },
              ].map(p => (
                <button key={p.id} onClick={() => { setPlatform(p.id); reset(); setFound([]); }}
                  style={{ flex: 1, background: platform === p.id ? p.color + "22" : C.surface2, border: `1px solid ${platform === p.id ? p.color : C.border}`, borderRadius: 7, padding: "7px 4px", fontSize: 10, fontWeight: 700, color: platform === p.id ? p.color : C.muted, cursor: "pointer" }}>
                  {p.label}
                </button>
              ))}
            </div>

            {platform === PLATFORMS.SLEEPER && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <input value={leagueId} onChange={e => setLeagueId(e.target.value)}
                  placeholder="Sleeper League ID (from URL)"
                  style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 7, padding: "7px 12px", color: C.text, fontSize: 12, outline: "none" }} />
                <div style={{ display: "flex", gap: 8 }}>
                  <input value={username} onChange={e => setUsername(e.target.value)} onKeyDown={e => e.key === "Enter" && connectSleeper()}
                    placeholder="Your Sleeper username"
                    style={{ flex: 1, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 7, padding: "7px 12px", color: C.text, fontSize: 12, outline: "none" }} />
                  <button onClick={connectSleeper} disabled={loading}
                    style={{ background: "#22C55E20", border: "1px solid #22C55E50", borderRadius: 7, padding: "7px 14px", fontSize: 12, color: C.accent, cursor: "pointer", fontWeight: 700, opacity: loading ? 0.6 : 1 }}>
                    {loading ? "…" : "Connect"}
                  </button>
                </div>
                <div style={{ fontSize: 10, color: C.muted }}>
                  League ID: <span style={{ fontFamily: "monospace", color: C.text }}>sleeper.com/leagues/<span style={{ color: C.accent }}>LEAGUE_ID</span></span>
                </div>
              </div>
            )}

            {platform === PLATFORMS.ESPN && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ background: "#EF444410", border: "1px solid #EF444430", borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#EF4444", marginBottom: 4 }}>ESPN Private League Auth</div>
                  <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.6 }}>
                    Public leagues work without auth. For private leagues, copy your <code style={{ color: C.text }}>espn_s2</code> and <code style={{ color: C.text }}>SWID</code> cookies from F12 DevTools → Application → Cookies.
                  </div>
                </div>
                <input value={espnLeagueId} onChange={e => setEspnLeagueId(e.target.value)} placeholder="ESPN League ID (from URL: /league/123456)" style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 7, padding: "7px 12px", color: C.text, fontSize: 12, outline: "none" }} />
                <input value={espnS2} onChange={e => setEspnS2(e.target.value)} placeholder="espn_s2 cookie (optional)" style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 7, padding: "7px 12px", color: C.text, fontSize: 12, outline: "none" }} />
                <input value={swid} onChange={e => setSwid(e.target.value)} placeholder="SWID cookie (optional)" style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 7, padding: "7px 12px", color: C.text, fontSize: 12, outline: "none" }} />
                <button onClick={connectESPN} disabled={loading || !espnLeagueId.trim()}
                  style={{ background: "#EF444420", border: "1px solid #EF444450", borderRadius: 7, padding: "8px", fontSize: 12, color: "#EF4444", cursor: "pointer", fontWeight: 700, opacity: loading ? 0.6 : 1 }}>
                  {loading ? "Connecting…" : "Connect ESPN League"}
                </button>
              </div>
            )}

            {platform === PLATFORMS.YAHOO && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ background: "#5B21B610", border: "1px solid #5B21B630", borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#7C3AED", marginBottom: 4 }}>Yahoo Fantasy OAuth</div>
                  <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.6 }}>
                    Yahoo requires OAuth. Click below to authenticate.
                  </div>
                </div>
                <button onClick={startYahooOAuth}
                  style={{ background: "#5B21B620", border: "1px solid #5B21B650", borderRadius: 7, padding: "8px", fontSize: 12, color: "#7C3AED", cursor: "pointer", fontWeight: 700 }}>
                  Connect with Yahoo →
                </button>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ flex: 1, height: 1, background: C.border }} />
                  <span style={{ fontSize: 10, color: C.muted }}>or paste access token manually</span>
                  <div style={{ flex: 1, height: 1, background: C.border }} />
                </div>
                <input value={yahooToken} onChange={e => setYahooToken(e.target.value)} placeholder="Yahoo access token" style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 7, padding: "7px 12px", color: C.text, fontSize: 12, outline: "none" }} />
                <button onClick={connectYahooWithToken} disabled={loading || !yahooToken.trim()}
                  style={{ background: "#5B21B620", border: "1px solid #5B21B650", borderRadius: 7, padding: "8px", fontSize: 12, color: "#7C3AED", cursor: "pointer", fontWeight: 700, opacity: loading ? 0.6 : 1 }}>
                  {loading ? "Looking up leagues…" : "Find My Yahoo Leagues"}
                </button>
                {found.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {found.map(l => {
                      const added = alreadyAdded(l.platformLeagueId, PLATFORMS.YAHOO);
                      return (
                        <button key={l.platformLeagueId} onClick={() => !added && connectYahooFound(l)} disabled={added}
                          style={{ background: added ? "#22C55E08" : C.bg, border: `1px solid ${added ? C.accent + "40" : C.border}`, borderRadius: 8, padding: "9px 12px", display: "flex", justifyContent: "space-between", cursor: added ? "default" : "pointer" }}>
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{l.name}</div>
                            <div style={{ fontSize: 9, color: C.muted, fontFamily: "monospace" }}>{l.totalTeams} teams · {l.season}</div>
                          </div>
                          <span style={{ fontSize: 11, color: added ? C.accent : C.muted }}>{added ? "✓" : "+"}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {error   && <div style={{ fontSize: 11, color: C.danger, marginTop: 10, fontFamily: "monospace" }}>⚠ {error}</div>}
            {success && <div style={{ fontSize: 11, color: C.accent, marginTop: 10, fontFamily: "monospace" }}>✓ {success}</div>}
          </div>
        </div>
      </div>
    </div>
  );
};