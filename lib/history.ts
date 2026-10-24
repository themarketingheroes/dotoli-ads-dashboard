import { cache } from "react";
import { addDays, todayIn } from "./dates";
import { googleHistory, googleInfo } from "./google";
import { metaHistory, metaInfo } from "./meta";
import { readLatestJson, writeJson } from "./store";
import type { DailyStore, Platform } from "./types";

// ~13 months so "same period last year" works for the current month.
const HISTORY_DAYS = 400;
// Recent days are refetched every refresh because conversions arrive late.
const OVERLAP_DAYS = 35;

// Bump when DailyRow contents change so every account refetches its full history once.
export const STORE_VERSION = 2;

const prefix = (platform: Platform, id: string) => `daily/${platform}-${id}`;

export const loadStore = cache(async (platform: Platform, id: string): Promise<DailyStore | null> => {
  return readLatestJson<DailyStore>(prefix(platform, id));
});

export async function updateStore(platform: Platform, id: string) {
  const info = platform === "meta" ? await metaInfo(id) : await googleInfo(id);
  const today = todayIn(info.timezone);
  const earliest = addDays(today, -HISTORY_DAYS);
  const existing = await readLatestJson<DailyStore>(prefix(platform, id));
  const full = !existing || existing.from > earliest || existing.platform !== platform || existing.version !== STORE_VERSION;
  const from = full ? earliest : addDays(today, -OVERLAP_DAYS);

  const fresh = platform === "meta" ? await metaHistory(id, from, today) : await googleHistory(id, from, today);
  const kept = full ? [] : existing!.rows.filter((r) => r.d < from && r.d >= earliest);

  const store: DailyStore = {
    platform,
    id,
    name: info.name || existing?.name || id,
    currency: info.currency,
    timezone: info.timezone,
    updatedAt: new Date().toISOString(),
    version: STORE_VERSION,
    from: full ? earliest : existing!.from < earliest ? earliest : existing!.from,
    to: today,
    campaigns: { ...(existing?.campaigns ?? {}), ...fresh.campaigns },
    actions: { ...(full ? {} : (existing?.actions ?? {})), ...(fresh.actions ?? {}) },
    rows: [...kept, ...fresh.rows].sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0)),
  };
  return { store, status: info.status };
}

export async function saveStore(store: DailyStore) {
  await writeJson(prefix(store.platform, store.id), store, 3);
}
