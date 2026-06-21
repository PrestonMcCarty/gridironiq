"use client";
import { useState, useRef, useEffect } from "react";
import { C } from "@/lib/theme";
import { SyncIcon } from "@/components/ui/Icons";
import { usePlayersCtx } from "@/hooks/usePlayersContext";

export const SleeperSync = ({ onPicksUpdate }) => {
  const { players } = usePlayersCtx();
  const [draftId, setDraftId] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [status,  setStatus]  = useState(null);
  const [error,   setError]   = useState(null);
  const intervalRef = useRef(null);

  const startSync = async () => {
    if (!draftId) { setError("Enter a Sleeper Draft ID"); return; }
    setSyncing(true); setError(null); setStatus("Connecting to Sleeper…");
    const poll = async () => {
      try {
        const res  = await fetch(`https://api.sleeper.app/v1/draft/${draftId}/picks`);
        const data = await res.json();
        if (Array.isArray(data)) {
          onPicksUpdate(data.map(pick => ({
            pickNumber:      pick.pick_no,
            playerName:      `${pick.metadata?.first_name || ""} ${pick.metadata?.last_name || ""}`.trim(),
            position:        pick.metadata?.position || "?",
            nflTeam:         pick.metadata?.team || "?",
            sleeperPlayerId: pick.player_id,
          })));
          setStatus(`✓ Synced — ${data.length} picks received`);
        }
      } catch (e) {
        setError("Could not reach Sleeper API. Check your Draft ID.");
        setSyncing(false);
        clearInterval(intervalRef.current);
      }
    };
    await poll();
    intervalRef.current = setInterval(poll, 10000);
  };

  useEffect(() => () => clearInterval(intervalRef.current), []);

  return (
    <div style={{ background: C.surface2, borderRadius: 10, border: `1px solid ${C.border}`, padding: 14, marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <SyncIcon c={syncing ? C.accent : C.muted} />
        <span style={{ fontSize: 10, fontWeight: 800, color: syncing ? C.accent : C.muted, letterSpacing: 1.5, fontFamily: "monospace" }}>
          {syncing ? "SLEEPER LIVE SYNC ACTIVE" : "SLEEPER LIVE SYNC"}
        </span>
        {syncing && <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.accent, boxShadow: `0 0 6px ${C.accent}`, marginLeft: "auto" }} />}
      </div>
      {!syncing ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input value={draftId} onChange={e => setDraftId(e.target.value)} placeholder="Sleeper Draft ID from draft URL"
            style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 7, padding: "7px 12px", color: C.text, fontSize: 12, outline: "none", flex: "1 1 200px" }} />
          <button onClick={startSync} style={{ background: "#22C55E20", border: "1px solid #22C55E50", borderRadius: 7, padding: "7px 16px", fontSize: 12, color: C.accent, cursor: "pointer", fontWeight: 700, whiteSpace: "nowrap" }}>
            Start Sync
          </button>
        </div>
      ) : (
        <div style={{ fontSize: 11, color: C.accent, fontFamily: "monospace" }}>{status}</div>
      )}
      {error && <div style={{ fontSize: 11, color: C.danger, marginTop: 6, fontFamily: "monospace" }}>{error}</div>}
      <div style={{ fontSize: 10, color: C.muted, marginTop: 8, lineHeight: 1.5 }}>
        Find Draft ID in Sleeper URL: sleeper.com/draft/nfl/<strong style={{ color: C.text }}>DRAFT_ID</strong> · Syncs every 10s
      </div>
    </div>
  );
};
