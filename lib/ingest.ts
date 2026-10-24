import { saveStore, STORE_VERSION } from "./history";
import type { DailyRow, DailyStore, LiveCampaign } from "./types";

// One POST per Google Ads account from the Google Ads Script. Each push carries the
// whole window (~13 months) and replaces that account's stored history.
export interface IngestAccount {
  account: { id: string; name: string; currency: string; timezone: string };
  campaigns?: LiveCampaign[];
  rows?: [string, string, string, string, number, number, number][]; // date, campaign id, name, channel, cost, impressions, clicks
  conv?: [string, string, string, string, number, number, number?][]; // date, campaign id, action, category, conversions, value, all conversions
}

export async function ingestAccount(p: IngestAccount): Promise<{ id: string; rows: number; from: string; to: string }> {
  const id = String(p.account.id).replace(/\D/g, "");
  if (!id) throw new Error("Missing account id");

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
  return { id, rows: rows.length, from: store.from, to: store.to };
}
