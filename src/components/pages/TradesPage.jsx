"use client";
import { useState, useMemo, useEffect } from "react";
import { C } from "@/lib/theme";
import { usePlayersCtx } from "@/hooks/usePlayersContext";
import { LeagueTendenciesEngine } from "@/lib/engines/leagueTendencies";
import { TradeFinderEngine } from "@/lib/engines/tradeFinder";
import { InjuryBadge, PosBadge, ConfidenceMeter } from "@/components/ui/Badges";
import { BrainIcon, SyncIcon } from "@/components/ui/Icons";
import { PlayerModal } from "@/components/player/PlayerModal";
import { TradeProposalCard } from "@/components/trade/TradeProposalCard";
import { LeagueConnectPanel } from "@/components/trade/LeagueConnectPanel";
import { StandingsSidebar } from "@/components/trade/StandingsSidebar";

export const TradesPage = () => {
  const {
    players,
    leagueId, setLeagueId,
    leagueInfo, setLeagueInfo,
    myRosterId,
    rosters, users, transactions,
    leagueLoaded, leagueLoading,
    reloadLeague,
    setUserId,
    addLeague,
  } = usePlayersCtx();

  const [modal,       setModal]       = useState(null);
  const [expandedIdx, setExpandedIdx] = useState(null);
  const [activeTab,   setActiveTab]   = useState("finder");
  const [generating,  setGenerating]  = useState(false);
  const [proposals,   setProposals]   = useState([]);
  const [giving,      setGiving]      = useState([]);
  const [receiving,   setReceiving]   = useState([]);
  const [searchG,     setSearchG]     = useState("");
  const [searchR,     setSearchR]     = useState("");

  const managerProfiles = useMemo(() => {
    if (!rosters.length || !players.length) return {};
    return LeagueTendenciesEngine.buildAllProfiles(users, rosters, transactions, {}, players);
  }, [rosters, users, transactions, players]);

  const myProfile     = useMemo(() => myRosterId ? managerProfiles[myRosterId] : null, [managerProfiles, myRosterId]);
  const otherProfiles = useMemo(() => Object.values(managerProfiles).filter(p => p.rosterId !== myRosterId), [managerProfiles, myRosterId]);

  useEffect(() => {
    if (!myProfile || !otherProfiles.length || !players.length || generating) return;
    setGenerating(true);
    setTimeout(() => {
      try { setProposals(TradeFinderEngine.suggest(myProfile, otherProfiles, players, {}, 8)); }
      catch (e) { console.error("[TradeFinder]", e); }
      setGenerating(false);
    }, 100);
  }, [myProfile, otherProfiles, players]);

  useEffect(() => {
    if (players.length >= 8 && !giving.length) {
      const top = players.filter(p => !p.injury).slice(0, 8);
      setGiving([top[4]?.id, top[5]?.id].filter(Boolean));
      setReceiving([top[0]?.id, top[2]?.id].filter(Boolean));
    }
  }, [players]);

  const handleLeagueLoaded = (lid, uid, info) => {
    // Delegate to the multi-league store — this persists the league and makes
    // it the active league globally, so all pages see it immediately.
    addLeague(lid, uid, info);
  };

  const findP      = id => players.find(p => String(p.id) === String(id) || String(p.sleeperPlayerId) === String(id));
  const totalGive  = giving.reduce((s, id) => s + (findP(id)?.ppg || 0), 0);
  const totalRec   = receiving.reduce((s, id) => s + (findP(id)?.ppg || 0), 0);
  const fcGive     = giving.reduce((s, id) => s + (findP(id)?.fcValue || 0), 0);
  const fcRec      = receiving.reduce((s, id) => s + (findP(id)?.fcValue || 0), 0);
  const diff       = totalRec - totalGive;
  const fcDiff     = fcRec - fcGive;
  const verdict    = diff > 3 ? "YOU WIN" : diff < -3 ? "YOU LOSE" : "FAIR";
  const vc         = verdict === "YOU WIN" ? C.accent : verdict === "YOU LOSE" ? C.danger : C.warning;

  const manualAnalysis = useMemo(() => {
    if (!giving.length || !receiving.length) return null;
    const gP = giving.map(findP).filter(Boolean);
    const rP = receiving.map(findP).filter(Boolean);
    const gC = gP.reduce((s, p) => s + (p.aiRecommendation?.confidence || 50), 0) / (gP.length || 1);
    const rC = rP.reduce((s, p) => s + (p.aiRecommendation?.confidence || 50), 0) / (rP.length || 1);
    const injG = gP.filter(p => p.injury === "OUT" || p.injury === "IR");
    const injR = rP.filter(p => p.injury === "OUT" || p.injury === "IR");
    const reasons = [];
    const risks   = [];
    if (diff > 0) reasons.push(`You gain ${diff.toFixed(1)} PPG on average from this trade`);
    if (fcDiff > 0) reasons.push(`FantasyCalc value favors you by ${fcDiff} points`);
    if (rC > gC + 5) reasons.push(`Players you receive have higher AI confidence (${Math.round(rC)}% vs ${Math.round(gC)}%)`);
    if (injG.length) reasons.push(`${injG.map(p => p.name).join(", ")} carry injury risk — good time to sell`);
    if (injR.length) risks.push(`${injR.map(p => p.name).join(", ")} you receive are injured — verify timeline`);
    if (diff < 0) risks.push(`You give up ${Math.abs(diff).toFixed(1)} PPG — ensure positional need justifies the cost`);
    if (rP.some(p => p.trend === "down")) risks.push(`Trending-down player in the return — check last 4 game log`);
    const confidence = Math.min(92, Math.max(30, 50 + diff * 3 + (rC - gC) * 0.5 + injG.length * 5 - injR.length * 8));
    return { verdict, confidence: Math.round(confidence), reasons: reasons.length ? reasons : ["Trade is close to even in PPG value"], risks: risks.length ? risks : ["Standard weekly variance — both sides have upside"] };
  }, [giving, receiving, players]);

  const addToSide = (id, side) => {
    if (side === "give") {
      if (giving.includes(id)) setGiving(g => g.filter(x => x !== id));
      else if (giving.length < 4) setGiving(g => [...g, id]);
    } else {
      if (receiving.includes(id)) setReceiving(r => r.filter(x => x !== id));
      else if (receiving.length < 4) setReceiving(r => [...r, id]);
    }
  };

  const PlayerSearch = ({ side, search, setSearch }) => {
    const filtered = players.filter(p => p.name.toLowerCase().includes(search.toLowerCase())).slice(0, 6);
    const inSide   = side === "give" ? giving : receiving;
    if (!search) return null;
    return (
      <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden", marginTop: 2 }}>
        {filtered.map(p => (
          <div key={p.id} onClick={() => { addToSide(p.id, side); setSearch(""); }} style={{ padding: "8px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, borderBottom: `1px solid ${C.border}`, background: inSide.includes(p.id) ? "#22C55E10" : "transparent" }}
            onMouseEnter={e => e.currentTarget.style.background = "#22C55E09"} onMouseLeave={e => e.currentTarget.style.background = inSide.includes(p.id) ? "#22C55E10" : "transparent"}>
            <PosBadge pos={p.pos} />
            <span style={{ fontSize: 12, fontWeight: 700, color: C.text, flex: 1 }}>{p.name}</span>
            <span style={{ fontFamily: "monospace", fontSize: 11, color: C.accent }}>{p.ppg} PPG</span>
            {inSide.includes(p.id) && <span style={{ color: C.accent, fontSize: 11 }}>✓</span>}
          </div>
        ))}
      </div>
    );
  };

  const AnalyzerSide = ({ label, ids, side, search, setSearch }) => (
    <div style={{ flex: 1, background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden", minWidth: 0 }}>
      <div style={{ padding: "11px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: C.muted, fontFamily: "monospace", letterSpacing: 1.5 }}>{label}</span>
        <span style={{ fontSize: 10, fontFamily: "monospace", color: C.muted }}>{ids.length}/4 players</span>
      </div>
      <div style={{ padding: "8px 12px", position: "relative" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Add player to trade…" style={{ width: "100%", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 10px", color: C.text, fontSize: 12, outline: "none" }} />
        <PlayerSearch side={side} search={search} setSearch={setSearch} />
      </div>
      {ids.map(id => {
        const p = findP(id); if (!p) return null;
        return (
          <div key={id} onClick={() => setModal(p)} style={{ padding: "14px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
            onMouseEnter={e => e.currentTarget.style.background = "#22C55E09"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <PosBadge pos={p.pos} />
                <span style={{ fontSize: 10, color: C.muted, fontFamily: "monospace" }}>{p.team}</span>
                <InjuryBadge status={p.injury} />
                {p.aiRecommendation && <span style={{ fontSize: 10, fontFamily: "monospace", color: p.aiRecommendation.confidence >= 70 ? C.accent : C.muted }}>{p.aiRecommendation.confidence}% conf</span>}
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 800, color: C.text }}>{p.ppg}</div>
              <div style={{ fontSize: 9, color: C.muted, letterSpacing: 1 }}>PPG</div>
            </div>
            <button onClick={e => { e.stopPropagation(); addToSide(id, side); }} style={{ background: "#EF444420", border: "1px solid #EF444440", borderRadius: 4, padding: "2px 7px", fontSize: 11, color: C.danger, cursor: "pointer", fontWeight: 700 }}>✕</button>
          </div>
        );
      })}
      <div style={{ padding: "11px 14px", display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: 10, color: C.muted, fontFamily: "monospace" }}>TOTAL PPG</span>
        <span style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 800, color: C.text }}>{(label === "YOU GIVE" ? totalGive : totalRec).toFixed(1)}</span>
      </div>
    </div>
  );

  const tabs = [
    { id: "finder",   label: "🔍 Trade Finder",    badge: proposals.length > 0 ? proposals.length : null },
    { id: "analyzer", label: "⚡ Trade Analyzer",   badge: null },
    { id: "profiles", label: "👥 Manager Profiles", badge: Object.keys(managerProfiles).length > 0 ? Object.keys(managerProfiles).length : null },
  ];

  return (
    <div>
      <PlayerModal player={modal} onClose={() => setModal(null)} />
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: C.text, margin: 0, letterSpacing: -0.5 }}>
              AI Trade Finder
              <span style={{ fontSize: 12, fontWeight: 600, color: C.accent, marginLeft: 10, fontFamily: "monospace", letterSpacing: 1 }}>FLAGSHIP</span>
            </h1>
            <p style={{ color: C.muted, fontSize: 12, margin: "4px 0 0" }}>
              {leagueInfo ? `Connected: ${leagueInfo.name} · ` : ""}League Tendencies Engine · Manager Profiling · Championship Impact
            </p>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {leagueLoading && <span style={{ fontSize: 10, color: C.warning, fontFamily: "monospace" }}>Loading league data…</span>}
            {generating && <span style={{ fontSize: 10, color: C.accent, fontFamily: "monospace" }}>Generating trades…</span>}
            {leagueLoaded && <button onClick={reloadLeague} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 10px", fontSize: 11, color: C.muted, cursor: "pointer" }}><SyncIcon c={C.muted} /></button>}
          </div>
        </div>
      </div>

      {!leagueLoaded && <LeagueConnectPanel onLeagueLoaded={handleLeagueLoaded} />}

      <div style={{ display: "flex", gap: 4, marginBottom: 14, borderBottom: `1px solid ${C.border}`, paddingBottom: 0 }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: "8px 14px", fontSize: 12, fontWeight: 600, color: activeTab === tab.id ? C.accent : C.muted, borderBottom: activeTab === tab.id ? `2px solid ${C.accent}` : "2px solid transparent", display: "flex", alignItems: "center", gap: 5, marginBottom: -1 }}>
            {tab.label}
            {tab.badge && <span style={{ background: C.accent + "25", color: C.accent, fontSize: 9, fontFamily: "monospace", fontWeight: 800, padding: "1px 5px", borderRadius: 3 }}>{tab.badge}</span>}
          </button>
        ))}
      </div>

      {activeTab === "finder" && (
        <div>
          {!leagueLoaded && !leagueLoading && (
            <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, padding: 32, textAlign: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 8 }}>Connect your Sleeper league above</div>
              <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6, maxWidth: 480, margin: "0 auto" }}>The Trade Finder analyzes all rosters, builds behavioral profiles for every manager, and surfaces the best opportunities ranked by acceptance probability and championship impact.</div>
            </div>
          )}
          {leagueLoaded && proposals.length > 0 && (
            <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                {proposals.map((p, idx) => (
                  <TradeProposalCard key={p.id} proposal={p} onPlayerClick={setModal} expanded={expandedIdx === idx} onToggle={() => setExpandedIdx(expandedIdx === idx ? null : idx)} />
                ))}
              </div>
              <StandingsSidebar profiles={managerProfiles} myRosterId={myRosterId} />
            </div>
          )}
          {leagueLoaded && !generating && proposals.length === 0 && (
            <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, padding: 24, textAlign: "center" }}>
              <div style={{ fontSize: 13, color: C.text, fontWeight: 700, marginBottom: 6 }}>No trades found matching your roster needs</div>
              <div style={{ fontSize: 12, color: C.muted }}>Your roster may already be well-balanced, or other managers may have limited matching players.</div>
            </div>
          )}
        </div>
      )}

      {activeTab === "analyzer" && (
        <div>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
            <AnalyzerSide label="YOU GIVE"    ids={giving}    side="give"    search={searchG} setSearch={setSearchG} />
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "36px 4px 0", flexShrink: 0 }}>
              <div style={{ background: vc + "20", border: `2px solid ${vc}`, borderRadius: 10, padding: "14px 18px", textAlign: "center", minWidth: 96 }}>
                <div style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 900, color: vc }}>{verdict}</div>
                <div style={{ fontFamily: "monospace", fontSize: 10, color: C.muted, marginTop: 2 }}>{Math.abs(diff).toFixed(1)} PPG {diff > 0 ? "gained" : "lost"}</div>
              </div>
              <span style={{ color: C.muted, fontSize: 18 }}>⇄</span>
            </div>
            <AnalyzerSide label="YOU RECEIVE" ids={receiving} side="receive" search={searchR} setSearch={setSearchR} />
          </div>
          {manualAnalysis && (
            <div style={{ marginTop: 14, background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <BrainIcon c={C.accent} />
                <p style={{ margin: 0, fontSize: 10, fontWeight: 800, color: C.accent, letterSpacing: 1.5, fontFamily: "monospace" }}>⚡ AI TRADE ANALYSIS</p>
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 10, color: C.muted, fontFamily: "monospace" }}>Confidence:</span>
                  <ConfidenceMeter value={manualAnalysis.confidence} size="sm" />
                </div>
              </div>
              {fcGive > 0 && fcRec > 0 && (
                <div style={{ display: "flex", gap: 12, marginBottom: 12, background: C.surface2, borderRadius: 8, padding: 10 }}>
                  {[{ l: "FantasyCalc Give", v: fcGive }, { l: "FantasyCalc Receive", v: fcRec }, { l: "FC Difference", v: fcDiff, col: fcDiff > 0 ? C.accent : C.danger }].map(s => (
                    <div key={s.l} style={{ textAlign: "center", flex: 1 }}>
                      <div style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 800, color: s.col || C.text }}>{s.v > 0 ? s.v : "—"}</div>
                      <div style={{ fontSize: 9, color: C.muted }}>{s.l}</div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 9, color: C.accent, fontFamily: "monospace", letterSpacing: 1, marginBottom: 5 }}>WHY</div>
                {manualAnalysis.reasons.map((r, i) => <div key={i} style={{ fontSize: 12, color: C.muted, marginBottom: 4, display: "flex", gap: 6, lineHeight: 1.5 }}><span style={{ color: C.accent }}>→</span><span>{r}</span></div>)}
              </div>
              <div>
                <div style={{ fontSize: 9, color: C.danger, fontFamily: "monospace", letterSpacing: 1, marginBottom: 5 }}>RISK FACTORS</div>
                {manualAnalysis.risks.map((r, i) => <div key={i} style={{ fontSize: 12, color: C.muted, marginBottom: 4, display: "flex", gap: 6, lineHeight: 1.5 }}><span style={{ color: C.danger }}>⚠</span><span>{r}</span></div>)}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "profiles" && (
        <div>
          {!leagueLoaded && (
            <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, padding: 24, textAlign: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 6 }}>Connect your league to see manager profiles</div>
              <div style={{ fontSize: 12, color: C.muted }}>The League Tendencies Engine analyzes every manager&apos;s trade history, waiver activity, positional preferences, and risk tolerance.</div>
            </div>
          )}
          {leagueLoaded && Object.keys(managerProfiles).length > 0 && (
            <div>
              <div style={{ fontSize: 10, color: C.muted, fontFamily: "monospace", letterSpacing: 1, marginBottom: 12 }}>LEAGUE TENDENCIES ENGINE — {Object.keys(managerProfiles).length} MANAGER PROFILES COMPUTED</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 12 }}>
                {Object.values(managerProfiles).sort((a, b) => b.acceptanceBaserate - a.acceptanceBaserate).map(profile => {
                  const gc2 = g => ({ A: C.accent, B: C.blue, C: C.warning, D: C.danger }[g] || C.muted);
                  const isMe = profile.rosterId === myRosterId;
                  return (
                    <div key={profile.rosterId} style={{ background: C.surface, borderRadius: 12, border: `1px solid ${isMe ? C.accent + "60" : C.border}`, padding: 14, position: "relative" }}>
                      {isMe && <div style={{ position: "absolute", top: 8, right: 8, fontSize: 9, color: C.accent, fontFamily: "monospace", fontWeight: 800, background: "#22C55E20", border: "1px solid #22C55E40", borderRadius: 3, padding: "1px 5px" }}>YOU</div>}
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 8, background: isMe ? C.accent + "20" : C.surface2, border: `1px solid ${isMe ? C.accent + "40" : C.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 900, color: isMe ? C.accent : C.text }}>
                          {(profile.displayName || "?")[0].toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{profile.displayName}</div>
                          <div style={{ fontSize: 10, color: C.muted, fontFamily: "monospace" }}>{profile.record.wins}–{profile.record.losses} · #{profile.rank}/{profile.totalTeams}</div>
                        </div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginBottom: 10 }}>
                        {Object.entries(profile.rosterGrades || {}).map(([pos, g]) => (
                          <div key={pos} style={{ textAlign: "center", background: C.surface2, borderRadius: 6, padding: "5px 4px" }}>
                            <div style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 900, color: gc2(g) }}>{g}</div>
                            <div style={{ fontSize: 9, color: C.muted }}>{pos}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 10 }}>
                        {[
                          { label: "Trade Openness", value: profile.acceptanceBaserate, col: profile.acceptanceBaserate >= 60 ? C.accent : profile.acceptanceBaserate >= 40 ? C.blue : C.muted },
                          { label: "Risk Tolerance",  value: profile.riskTolerance,     col: profile.riskTolerance >= 70 ? C.danger : profile.riskTolerance >= 40 ? C.warning : C.accent },
                          { label: "Win-Now Bias",    value: profile.winNowBias,        col: profile.winNowBias >= 70 ? C.accent : profile.winNowBias >= 40 ? C.blue : C.muted },
                        ].map(m => (
                          <div key={m.label}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                              <span style={{ fontSize: 9, color: C.muted, fontFamily: "monospace" }}>{m.label.toUpperCase()}</span>
                              <span style={{ fontSize: 9, fontFamily: "monospace", fontWeight: 700, color: m.col }}>{m.value}%</span>
                            </div>
                            <div style={{ height: 3, background: C.border, borderRadius: 2, overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${m.value}%`, background: m.col, borderRadius: 2 }} />
                            </div>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 9, fontFamily: "monospace", color: C.muted, background: C.bg, borderRadius: 3, padding: "1px 5px" }}>{profile.tradeFreqLabel}</span>
                        <span style={{ fontSize: 9, fontFamily: "monospace", color: C.muted, background: C.bg, borderRadius: 3, padding: "1px 5px" }}>{profile.waiverLabel}</span>
                        {profile.playoffContention
                          ? <span style={{ fontSize: 9, fontFamily: "monospace", color: C.accent, background: "#22C55E15", border: "1px solid #22C55E30", borderRadius: 3, padding: "1px 5px" }}>PLAYOFF HUNT</span>
                          : <span style={{ fontSize: 9, fontFamily: "monospace", color: C.danger, background: "#EF444415", border: "1px solid #EF444430", borderRadius: 3, padding: "1px 5px" }}>OUT OF HUNT</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
