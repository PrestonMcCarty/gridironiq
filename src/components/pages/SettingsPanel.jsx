"use client";
import { C } from "@/lib/theme";
import { CloseIcon } from "@/components/ui/Icons";

export const SettingsPanel = ({ settings, setSettings, onClose }) => (
  <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "#000000c0", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
    <div onClick={e => e.stopPropagation()} style={{ background: C.surface, borderRadius: 16, border: `1px solid ${C.border}`, width: "100%", maxWidth: 480, padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: C.text }}>League Settings</h2>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}><CloseIcon c={C.muted} /></button>
      </div>

      {[
        { label: "Teams",   key: "teams",   options: [8, 10, 12, 14] },
        { label: "Scoring", key: "scoring", options: ["PPR", "Half-PPR", "Standard"] },
      ].map(row => (
        <div key={row.key} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: C.muted, fontFamily: "monospace", letterSpacing: 1.5, marginBottom: 6 }}>{row.label.toUpperCase()}</div>
          <div style={{ display: "flex", gap: 6 }}>
            {row.options.map(opt => (
              <button key={opt} onClick={() => setSettings(s => ({ ...s, [row.key]: opt }))}
                style={{ flex: 1, background: settings[row.key] === opt ? C.accent + "20" : C.surface2, border: `1px solid ${settings[row.key] === opt ? C.accent : C.border}`, color: settings[row.key] === opt ? C.accent : C.muted, borderRadius: 7, padding: "8px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                {opt}
              </button>
            ))}
          </div>
        </div>
      ))}

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: C.muted, fontFamily: "monospace", letterSpacing: 1.5, marginBottom: 6 }}>ROSTER SLOTS</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
          {["QB","RB","WR","TE","FLEX","BN"].map(slot => (
            <div key={slot}>
              <div style={{ fontSize: 10, color: C.muted, fontFamily: "monospace", marginBottom: 4 }}>{slot}</div>
              <div style={{ display: "flex", gap: 3 }}>
                {[0,1,2,3,4,6,8].slice(0, slot === "BN" ? 6 : 4).map(n => (
                  <button key={n} onClick={() => setSettings(s => ({ ...s, slots: { ...s.slots, [slot]: n } }))}
                    style={{ flex: 1, background: settings.slots[slot] === n ? C.accent + "20" : C.surface2, border: `1px solid ${settings.slots[slot] === n ? C.accent : C.border}`, color: settings.slots[slot] === n ? C.accent : C.muted, borderRadius: 4, padding: "4px 2px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <button onClick={() => setSettings(s => ({ ...s, superflex: !s.superflex }))}
          style={{ width: 40, height: 22, borderRadius: 11, background: settings.superflex ? C.accent : C.border, border: "none", cursor: "pointer", position: "relative", transition: "background 0.2s" }}>
          <div style={{ width: 16, height: 16, borderRadius: "50%", background: "white", position: "absolute", top: 3, left: settings.superflex ? 21 : 3, transition: "left 0.2s" }} />
        </button>
        <span style={{ fontSize: 12, color: C.muted }}>Superflex / 2-QB</span>
      </div>

      <div style={{ marginBottom: 14, fontSize: 11, color: C.muted, background: C.surface2, borderRadius: 8, padding: 12, lineHeight: 1.6 }}>
        <span style={{ color: C.accent, fontWeight: 700 }}>Data sources:</span> Sleeper API (players, stats, projections) + ESPN (schedule/opponents) + FantasyCalc (rankings, trade values). Intelligence Engine re-runs on every settings change.
      </div>

      <button onClick={onClose} style={{ width: "100%", background: C.accent, border: "none", borderRadius: 8, padding: "10px", fontSize: 13, fontWeight: 800, color: "#000", cursor: "pointer" }}>
        Save Settings
      </button>
    </div>
  </div>
);
