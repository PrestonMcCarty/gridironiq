"use client";
import { useState } from "react";
import { C } from "@/lib/theme";
import { SyncIcon } from "@/components/ui/Icons";
import { SleeperAdapter } from "@/lib/league/adapters/SleeperAdapter";

export const LeagueConnectPanel = ({ onLeagueLoaded }) => {
  const [leagueId, setLeagueId] = useState("");
  const [username, setUsername] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [done,     setDone]     = useState(false);

  const connect = async () => {
    if (!leagueId.trim()) { setError("Enter your Sleeper League ID."); return; }
    if (!username.trim()) { setError("Enter your Sleeper username."); return; }
    setLoading(true); setError(null);
    try {
      const user = await SleeperAdapter.getUserByUsername(username.trim());
      await SleeperAdapter.verifyMembership(leagueId.trim(), user.user_id);
      const info = await SleeperAdapter.getLeagueInfo(leagueId.trim());
      onLeagueLoaded(leagueId.trim(), user.user_id, info);
      setDone(true);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  if (done) return null;

  return (
    <div style={{ background: C.surface2, borderRadius: 12, border: `1px solid ${C.accent}40`, padding: 16, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <SyncIcon c={C.accent} />
        <span style={{ fontSize: 10, fontWeight: 800, color: C.accent, letterSpacing: 1.5, fontFamily: "monospace" }}>CONNECT YOUR SLEEPER LEAGUE</span>
        <span style={{ marginLeft: "auto", fontSize: 10, color: C.muted, fontFamily: "monospace" }}>Enables manager profiling + personalized trade suggestions</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            value={leagueId}
            onChange={e => setLeagueId(e.target.value)}
            placeholder="Sleeper League ID"
            style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 7, padding: "7px 12px", color: C.text, fontSize: 12, outline: "none", flex: "1 1 200px" }}
          />
          <input
            value={username}
            onChange={e => setUsername(e.target.value)}
            onKeyDown={e => e.key === "Enter" && connect()}
            placeholder="Your Sleeper username"
            style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 7, padding: "7px 12px", color: C.text, fontSize: 12, outline: "none", flex: "1 1 160px" }}
          />
          <button
            onClick={connect}
            disabled={loading}
            style={{ background: "#22C55E20", border: "1px solid #22C55E50", borderRadius: 7, padding: "7px 16px", fontSize: 12, color: C.accent, cursor: "pointer", fontWeight: 700, whiteSpace: "nowrap", opacity: loading ? 0.6 : 1 }}
          >
            {loading ? "Connecting…" : "Connect"}
          </button>
        </div>
        <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.5 }}>
          League ID: sleeper.com/leagues/<strong style={{ color: C.text }}>LEAGUE_ID</strong>
        </div>
      </div>
      {error && <div style={{ fontSize: 11, color: C.danger, marginTop: 8, fontFamily: "monospace" }}>⚠ {error}</div>}
    </div>
  );
};
