import { getClients } from "./config";
import { flagAccount } from "./flags";
import { googleAccount } from "./google";
import { metaAccount, metaTokenExpiry } from "./meta";
import { readLatestJson, writeJson } from "./store";
import type { AccountReport, Platform, Snapshot } from "./types";

export const SNAPSHOT_PREFIX = "snapshots";

export async function latestSnapshot(): Promise<Snapshot | null> {
  return readLatestJson<Snapshot>(SNAPSHOT_PREFIX);
}

function failed(platform: Platform, id: string, err: unknown): AccountReport {
  const empty = { spend: 0, impressions: 0, clicks: 0, ctr: null, cpc: null, cpm: null, frequency: null, results: 0, costPerResult: null, value: 0, roas: null };
  return {
    platform, id, name: id, currency: "USD", timezone: "", status: "Error",
    error: err instanceof Error ? err.message : String(err),
    resultLabel: "Results", dates: { yesterday: "", last7: ["", ""], prev7: ["", ""] },
    yesterday: empty, last7: empty, prev7: empty, series: [], campaigns: [], flags: [],
  };
}

async function safe(platform: Platform, id: string): Promise<AccountReport> {
  try {
    const report = platform === "meta" ? await metaAccount(id) : await googleAccount(id);
    report.flags = flagAccount(report);
    return report;
  } catch (e) {
    const r = failed(platform, id, e);
    r.flags = flagAccount(r);
    return r;
  }
}

export async function runRefresh(trigger: "cron" | "manual"): Promise<Snapshot> {
  const started = Date.now();
  const clients = getClients();
  const [metaToken, reports] = await Promise.all([
    process.env.META_ACCESS_TOKEN ? metaTokenExpiry() : Promise.resolve({ expiresAt: null, error: "META_ACCESS_TOKEN is not set" }),
    Promise.all(
      clients.map(async (c) => ({
        slug: c.slug,
        name: c.name,
        meta: await Promise.all(c.meta.map((id) => safe("meta", id))),
        google: await Promise.all(c.google.map((id) => safe("google", id))),
      })),
    ),
  ]);
  const snapshot: Snapshot = {
    generatedAt: new Date().toISOString(),
    trigger,
    durationMs: Date.now() - started,
    metaToken,
    clients: reports,
  };
  await writeJson(SNAPSHOT_PREFIX, snapshot);
  return snapshot;
}
