import { saveStore, STORE_VERSION } from "./history";
import { readLatestJson, writeJson } from "./store";
import type { DailyRow, DailyStore, LiveCampaign } from "./types";

// One POST per Google Ads account from the Google Ads Script. Each push carries the
// whole window (~13 months) and replaces that account's stored history.
export interface IngestAccount {
  account: { id: string; name: string; currency: string; timezone: string };
  campaigns?: LiveCampaign[];
  rows?: [string, string, string, string, number, number, number][]; // date, campaign id, name, channel, cost, impressions, clicks
  conv?: [string, string, string, string, number, number, number?][]; // date, campaign id, action, category, conversions, value, all conversions
  report?: Record<string, unknown>; // month-to-date breakdown for the report page
  reportOnly?: boolean; // second send from the feed: store the report, leave the daily history alone
}

export async function ingestAccount(p: IngestAccount): Promise<{ id: string; rows: number; from: string; to: string; kept?: boolean }> {
  const id = String(p.account.id).replace(/\D/g, "");
  if (!id) throw new Error("Missing account id");

  if (p.reportOnly) {
    if (p.report) await writeJson(`report/google-${id}`, { ...p.report, account: p.account.name, currency: p.account.currency }, 3);
    return { id, rows: 0, from: "", to: "", kept: true };
  }

  // A push without daily spend rows must never wipe stored history: keep the
  // stored rows and only update the report and campaign settings.
  if (!(p.rows?.length)) {
    const existing = await readLatestJson<DailyStore>(`daily/google-${id}`);
    if (existing?.rows.some((r) => r.s > 0)) {
      if (p.campaigns?.length) existing.live = p.campaigns.map((c) => ({ ...c, id: String(c.id) }));
      existing.updatedAt = new Date().toISOString();
      await saveStore(existing);
      if (p.report) await writeJson(`report/google-${id}`, { ...p.report, account: existing.name, currency: existing.currency }, 3);
      return { id, rows: existing.rows.length, from: existing.from, to: existing.to, kept: true };
    }
  }

  const byKey = new Map<string, DailyRow>();
  const campaigns: DailyStore["campaigns"] = {};
  const actions: Record<string, string> = {};

  for (const [d, c, name, channel, s, i, k] of p.rows ?? []) {
    campaigns[String(c)] = { name, type: channel };
    byKey.set(`${d}|${c}`, { d, c: String(c), s: Number(s) || 0, i: Number(i) || 0, k: Number(k) || 0, r: 0, v: 0, a: {} });
  }
  for (const [d, c, action, category, n, v, all] of p.conv ?? []) {
    actions[action] = category;
    const row = byKey.get(`${d}|${c}`) ?? { d, c: String(c), s: 0, i: 0, k: 0, r: 0, v: 0, a: {} };
    const was = row.a![action] ?? [0, 0, 0];
    row.a![action] = [was[0] + (Number(n) || 0), was[1] + (Number(v) || 0), (was[2] ?? 0) + (Number(all ?? n) || 0)];
    byKey.set(`${d}|${c}`, row);
  }
  for (const c of p.campaigns ?? []) campaigns[String(c.id)] = { name: c.name, type: c.channel };

  const rows = [...byKey.values()].sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  const store: DailyStore = {
    platform: "google",
    id,
    name: p.account.name || id,
    currency: p.account.currency || "USD",
    timezone: p.account.timezone || "America/New_York",
    updatedAt: new Date().toISOString(),
    version: STORE_VERSION,
    from: rows[0]?.d ?? "",
    to: rows[rows.length - 1]?.d ?? "",
    campaigns,
    actions,
    live: (p.campaigns ?? []).map((c) => ({ ...c, id: String(c.id) })),
    rows,
  };
  await saveStore(store);
  if (p.report) await writeJson(`report/google-${id}`, { ...p.report, account: store.name, currency: store.currency }, 3);
  // Name -> id index, so the dashboard can list script accounts by name.
  const index = (await readLatestJson<Record<string, string>>("ingest/index")) ?? {};
  if (index[id] !== store.name) {
    index[id] = store.name;
    await writeJson("ingest/index", index, 3);
  }
  return { id, rows: rows.length, from: store.from, to: store.to };
}

export const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// Finds the pushed account whose name matches (exact first, then "contains").
export async function resolveByName(name: string): Promise<string | null> {
  const index = (await readLatestJson<Record<string, string>>("ingest/index")) ?? {};
  const want = normName(name);
  const entries = Object.entries(index);
  return (entries.find(([, n]) => normName(n) === want) ?? entries.find(([, n]) => normName(n).includes(want)))?.[0] ?? null;
}
