/**
 * LiveDataService
 * ═══════════════
 * Central singleton managing all live NFL data slots with independent TTLs.
 * Consumers call refreshStale() on a polling interval; the service only
 * re-fetches slots whose TTL has expired since their last successful fetch.
 *
 * Slot TTLs (ms):
 *   players     5 min  — injuries + opponent_abbr (short: injury status changes)
 *   projections 15 min — Sleeper weekly projections
 *   trending    15 min — waiver-wire add/drop data
 *   stats       24 hr  — historical weekly stats (rarely change after publication)
 *   fantasyCalc 60 min — ADP + trade values
 */

import { SleeperService }     from "@/lib/services/sleeper";
import { FantasyCalcService } from "@/lib/services/fantasycalc";
import { cache }              from "@/lib/cache";
import { CURRENT_SEASON, CURRENT_WEEK } from "@/lib/constants";

// Slot TTLs in milliseconds
const TTL = {
  players:     5  * 60_000,   //  5 min — injuries + opponent
  projections: 15 * 60_000,   // 15 min
  trending:    15 * 60_000,   // 15 min
  stats:       24 * 60 * 60_000, // 24 hr
  fantasyCalc: 60 * 60_000,   //  1 hr
};

// Cache keys used by SleeperService / FantasyCalcService (must match their fetchJSON calls)
const CACHE_KEYS = {
  players:     "https://api.sleeper.app/v1/players/nfl",
  projections: () => `https://api.sleeper.app/v1/projections/nfl/regular/${CURRENT_SEASON}/${CURRENT_WEEK}?season_type=regular`,
  trending:    "https://api.sleeper.app/v1/players/nfl/trending/add?lookback_hours=48&limit=25",
};

function makeSlot(label, ttlMs) {
  return { data: null, fetchedAt: null, ttlMs, label, isLoading: false, error: null };
}

const _slots = {
  players:     makeSlot("Player roster + injuries",   TTL.players),
  projections: makeSlot("Weekly projections",          TTL.projections),
  trending:    makeSlot("Trending adds/drops",         TTL.trending),
  stats:       makeSlot("Historical weekly stats",     TTL.stats),
  fantasyCalc: makeSlot("ADP + trade values",          TTL.fantasyCalc),
};

const _listeners = new Set();

function _notify() {
  _listeners.forEach(fn => {
    try { fn({ ..._slots }); } catch (_) {}
  });
}

function _ageMs(slotName) {
  const slot = _slots[slotName];
  if (!slot.fetchedAt) return Infinity;
  return Date.now() - slot.fetchedAt;
}

async function _fetchSlot(slotName, isSuperflex = false) {
  const slot = _slots[slotName];
  if (slot.isLoading) return;
  slot.isLoading = true;
  slot.error = null;
  try {
    let data;
    switch (slotName) {
      case "players":
        data = await SleeperService.getPlayers();
        break;
      case "projections":
        data = await SleeperService.getProjections(CURRENT_SEASON, CURRENT_WEEK);
        break;
      case "trending":
        data = await SleeperService.getTrending("add");
        break;
      case "stats":
        // Fetch last 8 weeks — re-use whichever are already cache-warm
        data = await Promise.all(
          Array.from({ length: 8 }, (_, i) => Math.max(1, CURRENT_WEEK - 7 + i))
            .map(w => SleeperService.getStats(CURRENT_SEASON, w))
        );
        break;
      case "fantasyCalc":
        data = await FantasyCalcService.getValues(isSuperflex);
        break;
      default:
        return;
    }
    slot.data      = data;
    slot.fetchedAt = Date.now();
  } catch (e) {
    slot.error = e.message;
    console.warn(`[LiveDataService] Failed to refresh slot "${slotName}":`, e.message);
  } finally {
    slot.isLoading = false;
    _notify();
  }
}

export const LiveDataService = {
  /**
   * Initial load — fetches all slots in parallel.
   * Called once from useLiveData on mount.
   */
  async initialLoad(isSuperflex = false) {
    await Promise.all(
      Object.keys(_slots).map(name => _fetchSlot(name, isSuperflex))
    );
  },

  /**
   * Refresh only the slots that have exceeded their TTL.
   * Called on each polling interval (every 60 s).
   */
  async refreshStale(isSuperflex = false) {
    const stale = Object.entries(_slots)
      .filter(([name, slot]) => _ageMs(name) > slot.ttlMs)
      .map(([name]) => name);
    if (!stale.length) return;
    await Promise.all(stale.map(name => _fetchSlot(name, isSuperflex)));
  },

  /** Force-refresh a specific slot regardless of TTL. */
  async forceRefresh(slotName, isSuperflex = false) {
    await _fetchSlot(slotName, isSuperflex);
  },

  /** Returns the named slot object (read-only snapshot). */
  getSlot(name) {
    return _slots[name] || null;
  },

  /** Returns all slot data as a flat dict for consumers. */
  getAll() {
    return {
      players:     _slots.players.data,
      projections: _slots.projections.data,
      trending:    _slots.trending.data,
      stats:       _slots.stats.data,
      fantasyCalc: _slots.fantasyCalc.data,
      fetchedAt: {
        players:     _slots.players.fetchedAt,
        projections: _slots.projections.fetchedAt,
        trending:    _slots.trending.fetchedAt,
        stats:       _slots.stats.fetchedAt,
        fantasyCalc: _slots.fantasyCalc.fetchedAt,
      },
    };
  },

  /** Age of a slot's data in whole minutes (Infinity if never fetched). */
  getAgeMinutes(name) {
    const ageMs = _ageMs(name);
    return ageMs === Infinity ? Infinity : Math.round(ageMs / 60_000);
  },

  /**
   * Returns names of slots whose data is stale beyond the given threshold.
   * Default threshold: 30 minutes (used by confidence penalty logic).
   */
  getStaleFlags(thresholdMs = 30 * 60_000) {
    return Object.keys(_slots).filter(name => _ageMs(name) > thresholdMs);
  },

  subscribe(fn) {
    _listeners.add(fn);
    // Immediately deliver current state
    fn({ ..._slots });
    return () => _listeners.delete(fn);
  },

  unsubscribe(fn) {
    _listeners.delete(fn);
  },
};
