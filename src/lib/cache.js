// ─── IN-MEMORY TTL CACHE ─────────────────────────────────────────────────────
// Client-side only. In production, replace with Redis or SWR/React Query.
const _cache = new Map();

export const cache = {
  get(key) {
    const e = _cache.get(key);
    if (!e) return null;
    if (Date.now() > e.exp) { _cache.delete(key); return null; }
    return e.val;
  },
  set(key, val, ttlMs = 300_000) {
    _cache.set(key, { val, exp: Date.now() + ttlMs });
  },
  clear() { _cache.clear(); },
};

export async function fetchJSON(url, ttlMs = 300_000, label = url) {
  const cached = cache.get(url);
  if (cached) return cached;
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    cache.set(url, data, ttlMs);
    return data;
  } catch (e) {
    console.warn(`[GridironIQ] fetch failed for ${label}:`, e.message);
    return null;
  }
}

export function parseCSV(text) {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map(line => {
    const vals = [];
    let cur = "", inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === "," && !inQ) { vals.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    vals.push(cur.trim());
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] ?? ""; });
    return obj;
  });
}
