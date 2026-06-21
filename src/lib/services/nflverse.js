import { cache, parseCSV } from "@/lib/cache";

export const NFLverseService = {
  async getWeeklyStats(season) {
    const url = `https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats_${season}.csv`;
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
    const cached = cache.get(`nflverse:weekly:${season}`);
    if (cached) return cached;
    try {
      const r = await fetch(proxyUrl);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const text = await r.text();
      const rows = parseCSV(text);
      cache.set(`nflverse:weekly:${season}`, rows, 3_600_000);
      return rows;
    } catch (e) {
      console.warn("[GridironIQ] NFLverse CSV failed:", e.message);
      return [];
    }
  },
};
