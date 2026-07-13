"use client";
import { useState } from "react";
import { C } from "@/lib/theme";

const RatingBar = ({ value, color, label }) => (
  <div>
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
      <span style={{ fontSize: 9, color: C.muted, fontFamily: "monospace", letterSpacing: 1 }}>{label}</span>
      <span style={{ fontSize: 9, fontFamily: "monospace", fontWeight: 800, color }}>{value}</span>
    </div>
    <div style={{ height: 4, background: C.border, borderRadius: 2, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${value}%`, background: color, borderRadius: 2, transition: "width 0.5s" }} />
    </div>
  </div>
);

export const DraftExplanationPanel = ({ explanation, color, playerName }) => {
  const [tab, setTab] = useState("why");
  if (!explanation) return null;

  const { why, whyNow, risks, alternatives, strength, confidence, riskRating, upsideRating, floorRating } = explanation;

  const tabs = [
    { id: "why",   label: "WHY" },
    { id: "now",   label: "WHY NOW" },
    { id: "risks", label: "RISKS" },
    { id: "alts",  label: "ALTERNATIVES" },
  ];

  const strengthColor =
    strength >= 85 ? "#22C55E" :
    strength >= 70 ? "#3B82F6" :
    strength >= 55 ? "#F59E0B" : "#EF4444";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

      {/* Strength banner */}
      <div style={{
        background: strengthColor + "15",
        border: `1px solid ${strengthColor}35`,
        borderRadius: 8,
        padding: "10px 12px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <div>
          <div style={{ fontSize: 9, fontWeight: 800, color: strengthColor, fontFamily: "monospace", letterSpacing: 1.5 }}>
            RECOMMENDATION STRENGTH
          </div>
          <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
            Based on rank, roster context, and tier
          </div>
        </div>
        <div style={{ fontFamily: "monospace", fontSize: 26, fontWeight: 900, color: strengthColor }}>
          {strength}%
        </div>
      </div>

      {/* Rating bars */}
      <div style={{ background: C.bg, borderRadius: 8, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 7 }}>
        <RatingBar value={confidence}   color={color}       label="CONFIDENCE" />
        <RatingBar value={upsideRating} color="#A855F7"     label="UPSIDE" />
        <RatingBar value={floorRating}  color="#3B82F6"     label="FLOOR" />
        <RatingBar value={riskRating}   color="#22C55E"     label="SAFETY" />
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 2, borderBottom: `1px solid ${C.border}`, marginBottom: 2 }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              padding: "6px 10px", fontSize: 9, fontWeight: 800,
              color: tab === t.id ? color : C.muted,
              borderBottom: tab === t.id ? `2px solid ${color}` : "2px solid transparent",
              letterSpacing: 1, fontFamily: "monospace",
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ minHeight: 80 }}>

        {tab === "why" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 9, fontWeight: 800, color, letterSpacing: 1.5, fontFamily: "monospace", marginBottom: 2 }}>
              WHY {playerName?.toUpperCase()}?
            </div>
            {(why || []).map((sentence, i) => (
              <div key={i} style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
                <span style={{ color, flexShrink: 0, fontSize: 11, marginTop: 1 }}>✓</span>
                <span style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>{sentence}</span>
              </div>
            ))}
          </div>
        )}

        {tab === "now" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 9, fontWeight: 800, color, letterSpacing: 1.5, fontFamily: "monospace", marginBottom: 2 }}>
              WHY DRAFT NOW?
            </div>
            {(whyNow || []).map((sentence, i) => (
              <div key={i} style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
                <span style={{ color, flexShrink: 0, fontSize: 11, marginTop: 1 }}>→</span>
                <span style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>{sentence}</span>
              </div>
            ))}
          </div>
        )}

        {tab === "risks" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 9, fontWeight: 800, color: "#EF4444", letterSpacing: 1.5, fontFamily: "monospace", marginBottom: 2 }}>
              RISK FACTORS
            </div>
            {(risks || []).map((r, i) => (
              <div key={i} style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
                <span style={{ color: "#EF4444", flexShrink: 0, fontSize: 11, marginTop: 1 }}>⚠</span>
                <span style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>{r}</span>
              </div>
            ))}
          </div>
        )}

        {tab === "alts" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 9, fontWeight: 800, color: C.muted, letterSpacing: 1.5, fontFamily: "monospace", marginBottom: 2 }}>
              ALTERNATIVES IF PASSED
            </div>
            {alternatives?.length ? alternatives.map((a, i) => (
              <div key={i} style={{ background: C.bg, borderRadius: 7, padding: "8px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{ fontSize: 9, fontFamily: "monospace", fontWeight: 800, color: C.muted, width: 14 }}>{i + 1}.</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{a.name}</span>
                    <span style={{ fontSize: 9, fontFamily: "monospace", color: C.muted }}>{a.pos}{a.rank}</span>
                  </div>
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 3, paddingLeft: 20 }}>{a.note}</div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 800, color: "#22C55E" }}>{a.ppg}</div>
                  <div style={{ fontSize: 8, color: C.muted }}>PPG</div>
                </div>
              </div>
            )) : (
              <div style={{ fontSize: 11, color: C.muted }}>No comparable alternatives available at this pick.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
