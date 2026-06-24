"use client";
import { C, gradeColor, posColor } from "@/lib/theme";
import { InjuryBadge, PosBadge, TrendIcon } from "@/components/ui/Badges";
import { DraftExplanationPanel } from "@/components/player/DraftExplanationPanel";

// ── Draft analytics helpers ────────────────────────────────────────────────
function getTierLabel(pos, posRank) {
  if (!posRank) return "Late";
  const tiers = {
    QB:  [[1,1,"Elite"],[2,3,"Tier 1"],[4,8,"Tier 2"],[9,16,"Tier 3"],[17,99,"Late"]],
    RB:  [[1,3,"Elite"],[4,8,"Tier 1"],[9,16,"Tier 2"],[17,28,"Tier 3"],[29,99,"Late"]],
    WR:  [[1,3,"Elite"],[4,8,"Tier 1"],[9,18,"Tier 2"],[19,30,"Tier 3"],[31,99,"Late"]],
    TE:  [[1,1,"Elite"],[2,4,"Tier 1"],[5,10,"Tier 2"],[11,18,"Tier 3"],[19,99,"Late"]],
    K:   [[1,5,"Tier 1"],[6,15,"Tier 2"],[16,99,"Late"]],
    DST: [[1,5,"Tier 1"],[6,12,"Tier 2"],[13,99,"Late"]],
  };
  const table = tiers[pos] || tiers.WR;
  for (const [min, max, label] of table) { if (posRank >= min && posRank <= max) return label; }
  return "Late";
}

function getScarcityLabel(pos, posRank) {
  if (!posRank) return "Low";
  const map = {
    QB:  [[1,2,"Elite"],[3,6,"High"],[7,14,"Medium"],[15,99,"Low"]],
    RB:  [[1,4,"Elite"],[5,10,"High"],[11,20,"Medium"],[21,99,"Low"]],
    WR:  [[1,4,"Elite"],[5,12,"High"],[13,24,"Medium"],[25,99,"Low"]],
    TE:  [[1,2,"Elite"],[3,5,"High"],[6,12,"Medium"],[13,99,"Low"]],
    K:   [[1,8,"Medium"],[9,99,"Low"]],
    DST: [[1,8,"Medium"],[9,99,"Low"]],
  };
  const table = map[pos] || map.WR;
  for (const [min, max, label] of table) { if (posRank >= min && posRank <= max) return label; }
  return "Low";
}

const SCARCITY_COLORS = { Elite: "#22C55E", High: "#3B82F6", Medium: "#F59E0B", Low: "#6B7280" };
const TIER_COLORS     = { Elite: "#22C55E", "Tier 1": "#3B82F6", "Tier 2": "#F59E0B", "Tier 3": "#6B7280", Late: "#374151" };
const NEED_GRADE_COLORS = {
  "A+": "#22C55E", "A": "#22C55E", "A-": "#4ADE80",
  "B+": "#3B82F6", "B": "#3B82F6", "B-": "#60A5FA",
  "C+": "#F59E0B", "C": "#F59E0B", "D": "#EF4444", "F": "#6B7280",
};

// ── RecCard ────────────────────────────────────────────────────────────────
export const RecCard = ({ label, rec, color, icon, onDraft, onView, currentPick }) => {
  if (!rec?.player) return null;
  const p   = rec.player;
  const pc  = posColor(p.pos);

  const tier     = getTierLabel(p.pos, p.posRank);
  const scarcity = getScarcityLabel(p.pos, p.posRank);
  const tierCol  = TIER_COLORS[tier]    || C.muted;
  const scarCol  = SCARCITY_COLORS[scarcity] || C.muted;

  // valueScore: ADP minus overallRank — positive means community drafts LATER than rank warrants
  // (undervalued). Negative means overdrafted relative to rank (reach).
  const valueScore = (p.adp && p.overallRank && p.adpSource !== "derived")
    ? Math.round(p.adp - p.overallRank) : null;
  const valueCol = valueScore === null ? C.muted
    : valueScore >= 10 ? "#22C55E" : valueScore >= 3 ? "#3B82F6"
    : valueScore >= -5 ? "#F59E0B" : "#EF4444";

  const needGradeCol = rec.needGrade ? (NEED_GRADE_COLORS[rec.needGrade] || C.muted) : null;

  return (
    <div style={{
      background: C.surface2, borderRadius: 14, border: `1px solid ${color}40`,
      padding: 18, flex: 1, minWidth: 260, maxWidth: 340,
      display: "flex", flexDirection: "column", gap: 12,
    }}>

      {/* Label */}
      <span style={{ fontSize: 9, fontWeight: 800, color, letterSpacing: 1.8, fontFamily: "monospace" }}>
        {icon} {label}
      </span>

      {/* Player name + pos/team */}
      <div>
        <div style={{ fontSize: 17, fontWeight: 900, color: C.text, lineHeight: 1.2, marginBottom: 6 }}>
          {p.name}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <PosBadge pos={p.pos} />
          <span style={{ fontSize: 11, color: C.muted, fontFamily: "monospace" }}>{p.team}</span>
          <InjuryBadge status={p.injury} />
        </div>
      </div>

      {/* Rank row */}
      <div style={{ display: "flex", gap: 0, background: C.bg, borderRadius: 8, overflow: "hidden" }}>
        {[
          p.overallRank ? { val: `#${p.overallRank}`, sub: "OVERALL", col: C.text } : null,
          p.posRank     ? { val: `${p.pos}${p.posRank}`, sub: "POS RANK", col: pc } : null,
          tier          ? { val: tier, sub: "TIER", col: tierCol } : null,
        ].filter(Boolean).map((item, i, arr) => (
          <div key={item.sub} style={{
            flex: 1, textAlign: "center", padding: "8px 4px",
            borderRight: i < arr.length - 1 ? `1px solid ${C.border}` : "none",
          }}>
            <div style={{ fontFamily: "monospace", fontSize: item.sub === "TIER" ? 11 : 15, fontWeight: 900, color: item.col, lineHeight: 1 }}>{item.val}</div>
            <div style={{ fontSize: 8, color: C.muted, letterSpacing: 1, marginTop: 3, fontFamily: "monospace" }}>{item.sub}</div>
          </div>
        ))}
      </div>

      {/* Stats row: ADP · Value · Scarcity */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 5 }}>
        {[
          { val: p.adp != null ? Math.round(p.adp) : "—", sub: "ADP",      col: C.text  },
          { val: valueScore === null ? "—" : valueScore > 0 ? `+${valueScore}` : valueScore === 0 ? "~0" : `${valueScore}`, sub: "VALUE", col: valueCol },
          { val: scarcity || "—", sub: "SCARCITY", col: scarCol },
        ].map(s => (
          <div key={s.sub} style={{ background: C.bg, borderRadius: 7, padding: "7px 4px", textAlign: "center" }}>
            <div style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 800, color: s.col, lineHeight: 1 }}>{s.val}</div>
            <div style={{ fontSize: 8, color: C.muted, letterSpacing: 1, marginTop: 3 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Team-fit scores (BEST FOR YOUR TEAM only) */}
      {(rec.needGrade || rec.fitScore || rec.impactScore) && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 5 }}>
          {rec.needGrade && (
            <div style={{ background: C.bg, borderRadius: 7, padding: "7px 4px", textAlign: "center" }}>
              <div style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 900, color: needGradeCol, lineHeight: 1 }}>{rec.needGrade}</div>
              <div style={{ fontSize: 8, color: C.muted, letterSpacing: 1, marginTop: 3 }}>NEED</div>
            </div>
          )}
          {rec.fitScore != null && (
            <div style={{ background: C.bg, borderRadius: 7, padding: "7px 4px", textAlign: "center" }}>
              <div style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 900, color: C.blue, lineHeight: 1 }}>{rec.fitScore}%</div>
              <div style={{ fontSize: 8, color: C.muted, letterSpacing: 1, marginTop: 3 }}>FIT</div>
            </div>
          )}
          {rec.impactScore != null && (
            <div style={{ background: C.bg, borderRadius: 7, padding: "7px 4px", textAlign: "center" }}>
              <div style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 900, color: C.accent, lineHeight: 1 }}>+{rec.impactScore}%</div>
              <div style={{ fontSize: 8, color: C.muted, letterSpacing: 1, marginTop: 3 }}>IMPACT</div>
            </div>
          )}
        </div>
      )}

      {/* ── AI Explanation Panel ── */}
      {rec.explanation && (
        <DraftExplanationPanel
          explanation={rec.explanation}
          color={color}
          playerName={p.name.split(" ")[0]}
        />
      )}

      {/* Trend */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <TrendIcon trend={p.trend} />
        <span style={{ fontSize: 11, color: C.muted }}>
          {p.trend === "up" ? "Trending up — momentum play" : p.trend === "down" ? "Trending down — use caution" : "Consistent producer"}
        </span>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={() => onView(p)}
          style={{ flex: 1, background: "none", border: `1px solid ${C.border}`, borderRadius: 7, padding: "8px", fontSize: 11, color: C.muted, cursor: "pointer", fontWeight: 600 }}>
          View Profile
        </button>
        <button onClick={() => onDraft(p.id, true)}
          style={{ flex: 1, background: color + "22", border: `1px solid ${color}50`, borderRadius: 7, padding: "8px", fontSize: 11, color, cursor: "pointer", fontWeight: 700 }}>
          ✓ Draft Mine
        </button>
      </div>
    </div>
  );
};
