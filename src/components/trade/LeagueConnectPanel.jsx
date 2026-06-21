"use client";
import { useState } from "react";
import { C } from "@/lib/theme";
import { SyncIcon } from "@/components/ui/Icons";
import { SleeperLeagueService } from "@/lib/services/sleeperLeague";

export const LeagueConnectPanel = ({ onLeagueLoaded }) => {
  const [username,  setUsername]  = useState("");
  const [leagueId,  setLeagueId]  = useState("");
  const [leagues,   setLeagues]   = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [step,      setStep]      = useState("input");

  const lookupUser = async () => {
    if (!username.trim()) { setError("Enter your Sleeper username"); return; }
    setLoading(true); setError(null);
    try {
      const user = await SleeperLeagueService.getUserByName(username.trim());
      if (!user) { setError("User not found — check your Sleeper username"); setLoading(false); return; }
      const userLeagues = await SleeperLeagueService.getLeaguesForUser(user.user_id);
      if (!userLeagues.length) { setError("No leagues found for this user"); setLoading(false); return; }
      setLeagues(userLeagues.map(l => ({ ...l, userId: user.user_id })));
      setStep("select");
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const connectDirect = async () => {
    if (!leagueId.trim()) { setError("Enter a League ID"); return; }
    setLoading(true); setError(null);
    try {
      const info = await SleeperLeagueService.getLeagueInfo(leagueId.trim());
      if (!info) { setError("League not found — check the ID"); setLoading(false); return; }
      onLeagueLoaded(leagueId.trim(), null, info);
      setStep("done");
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const selectLeague = (league) => { onLeagueLoaded(league.league_id, league.userId, league); setStep("done"); };

  if (step === "done") return null;

  return (
    <div style={{ background: C.surface2, borderRadius: 12, border: `1px solid ${C.accent}40`, padding: 16, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <SyncIcon c={C.accent} />
        <span style={{ fontSize: 10, fontWeight: 800, color: C.accent, letterSpacing: 1.5, fontFamily: "monospace" }}>CONNECT YOUR SLEEPER LEAGUE</span>
        <span style={{ marginLeft: "auto", fontSize: 10, color: C.muted, fontFamily: "monospace" }}>Enables manager profiling + personalized trade suggestions</span>
      </div>

      {step === "input" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input value={username} onChange={e => setUsername(e.target.value)} onKeyDown={e => e.key === "Enter" && lookupUser()}
              placeholder="Sleeper username" style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 7, padding: "7px 12px", color: C.text, fontSize: 12, outline: "none", flex: "1 1 160px" }} />
            <button onClick={lookupUser} disabled={loading} style={{ background: "#22C55E20", border: "1px solid #22C55E50", borderRadius: 7, padding: "7px 16px", fontSize: 12, color: C.accent, cursor: "pointer", fontWeight: 700, whiteSpace: "nowrap", opacity: loading ? 0.6 : 1 }}>
              {loading ? "Looking up…" : "Find My Leagues"}
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, height: 1, background: C.border }} />
            <span style={{ fontSize: 10, color: C.muted }}>or enter League ID directly</span>
            <div style={{ flex: 1, height: 1, background: C.border }} />
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input value={leagueId} onChange={e => setLeagueId(e.target.value)} onKeyDown={e => e.key === "Enter" && connectDirect()}
              placeholder="Sleeper League ID from URL" style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 7, padding: "7px 12px", color: C.text, fontSize: 12, outline: "none", flex: "1 1 200px" }} />
            <button onClick={connectDirect} disabled={loading} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 7, padding: "7px 14px", fontSize: 12, color: C.muted, cursor: "pointer", fontWeight: 700, whiteSpace: "nowrap", opacity: loading ? 0.6 : 1 }}>
              Connect
            </button>
          </div>
          <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.5 }}>Find your League ID: sleeper.com/leagues/<strong style={{ color: C.text }}>LEAGUE_ID</strong></div>
        </div>
      )}

      {step === "select" && (
        <div>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>Select a league to analyze:</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {leagues.map(l => (
              <button key={l.league_id} onClick={() => selectLeague(l)} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", textAlign: "left" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = C.accent + "60"} onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{l.name}</div>
                  <div style={{ fontSize: 10, color: C.muted, fontFamily: "monospace" }}>{l.total_rosters} teams · {l.settings?.type === 2 ? "Dynasty" : "Redraft"}</div>
                </div>
                <span style={{ fontSize: 12, color: C.accent }}>→</span>
              </button>
            ))}
          </div>
          <button onClick={() => setStep("input")} style={{ marginTop: 8, background: "none", border: "none", fontSize: 11, color: C.muted, cursor: "pointer" }}>← Back</button>
        </div>
      )}

      {error && <div style={{ fontSize: 11, color: C.danger, marginTop: 8, fontFamily: "monospace" }}>⚠ {error}</div>}
    </div>
  );
};
