import { fetchJSON } from "@/lib/cache";
import { CURRENT_WEEK, CURRENT_SEASON } from "@/lib/constants";

export const SleeperLeagueService = {
  async getLeaguesForUser(userId, season) {
    season = season ?? CURRENT_SEASON;
    if (!userId) return [];
    const url = `https://api.sleeper.app/v1/user/${userId}/leagues/nfl/${season}`;
    return await fetchJSON(url, 1_800_000, `sleeper:leagues:${userId}`) || [];
  },

  async getUserByName(username) {
    if (!username) return null;
    const url = `https://api.sleeper.app/v1/user/${username}`;
    return await fetchJSON(url, 3_600_000, `sleeper:user:${username}`);
  },

  async getRosters(leagueId) {
    if (!leagueId) return [];
    const url = `https://api.sleeper.app/v1/league/${leagueId}/rosters`;
    return await fetchJSON(url, 900_000, `sleeper:rosters:${leagueId}`) || [];
  },

  async getUsers(leagueId) {
    if (!leagueId) return [];
    const url = `https://api.sleeper.app/v1/league/${leagueId}/users`;
    return await fetchJSON(url, 3_600_000, `sleeper:users:${leagueId}`) || [];
  },

  async getLeagueInfo(leagueId) {
    if (!leagueId) return null;
    const url = `https://api.sleeper.app/v1/league/${leagueId}`;
    return await fetchJSON(url, 3_600_000, `sleeper:league:${leagueId}`);
  },

  async getTransactions(leagueId, week) {
    if (!leagueId) return [];
    const url = `https://api.sleeper.app/v1/league/${leagueId}/transactions/${week}`;
    return await fetchJSON(url, 1_800_000, `sleeper:transactions:${leagueId}:${week}`) || [];
  },

  async getMatchups(leagueId, week) {
    if (!leagueId) return [];
    const url = `https://api.sleeper.app/v1/league/${leagueId}/matchups/${week}`;
    return await fetchJSON(url, 900_000, `sleeper:matchups:${leagueId}:${week}`) || [];
  },

  async getFullTransactionHistory(leagueId) {
    if (!leagueId) return [];
    const weeks = Array.from({ length: CURRENT_WEEK }, (_, i) => i + 1);
    const chunks = [];
    for (let i = 0; i < weeks.length; i += 4) chunks.push(weeks.slice(i, i + 4));
    const all = [];
    for (const chunk of chunks) {
      const results = await Promise.all(chunk.map(w => this.getTransactions(leagueId, w)));
      results.forEach(r => all.push(...r));
    }
    return all;
  },

  async getFullMatchupHistory(leagueId) {
    if (!leagueId) return {};
    const weeks = Array.from({ length: CURRENT_WEEK }, (_, i) => i + 1);
    const chunks = [];
    for (let i = 0; i < weeks.length; i += 4) chunks.push(weeks.slice(i, i + 4));
    const byWeek = {};
    for (const chunk of chunks) {
      await Promise.all(chunk.map(async w => {
        const data = await this.getMatchups(leagueId, w);
        if (data?.length) byWeek[w] = data;
      }));
    }
    return byWeek;
  },
};
