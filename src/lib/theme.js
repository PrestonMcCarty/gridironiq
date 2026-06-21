// ─── THEME ───────────────────────────────────────────────────────────────────
export const C = {
  bg: "#0A0E17", surface: "#111827", surface2: "#1a2235",
  border: "#1F2937", accent: "#22C55E", danger: "#EF4444",
  warning: "#F59E0B", muted: "#6B7280", text: "#F9FAFB",
  blue: "#3B82F6", purple: "#A855F7",
};

export const gradeColor = g =>
  ({ A: C.accent, B: C.blue, C: C.warning, D: C.danger, "N/A": C.muted }[g] || C.muted);

export const gradePct = g =>
  ({ A: "95%", B: "70%", C: "45%", D: "20%", "N/A": "10%" }[g] || "10%");

export const posColor = p =>
  ({ QB: C.blue, RB: C.accent, WR: C.purple, TE: C.warning, K: C.muted, DST: "#EF4444" }[p] || C.muted);

export const NEWS_SOURCES = {
  sleeper:  { label: "Sleeper",  url: "https://sleeper.app",                        color: "#7C3AED" },
  rotowire: { label: "Rotowire", url: "https://www.rotowire.com/football/news.php",  color: "#F59E0B" },
  espn:     { label: "ESPN",     url: "https://www.espn.com/nfl/injuries",           color: "#EF4444" },
  nfl:      { label: "NFL.com",  url: "https://www.nfl.com/injuries",               color: "#3B82F6" },
  pfr:      { label: "PFR",      url: "https://www.pro-football-reference.com",     color: "#22C55E" },
  nflverse: { label: "NFLverse", url: "https://nflverse.github.io/nflverse-data/",  color: "#A855F7" },
};
