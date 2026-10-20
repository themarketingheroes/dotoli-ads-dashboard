import { byCampaign, dailySeries, sumRange } from "./aggregate";
import { addDays, windows } from "./dates";
import { finalize } from "./metrics";
import type { AccountReport, CampaignRow, DailyRow, DailyStore } from "./types";

const VERSION = process.env.META_API_VERSION || "v24.0";
const BASE = `https://graph.facebook.com/${VERSION}`;
const NO_RULE = {};

type Json = Record<string, any>;

function token(): string {
  const t = process.env.META_ACCESS_TOKEN;
  if (!t) throw new Error("META_ACCESS_TOKEN is not set");
  return t;
}

async function graph(path: string, params: Record<string, string> = {}): Promise<Json> {
  const qs = new URLSearchParams({ ...params, access_token: token() });
  const res = await fetch(`${BASE}/${path}?${qs}`, { cache: "no-store" });
  const body = (await res.json()) as Json;
  if (body.error) throw new Error(`Meta: ${body.error.message ?? "request failed"} (code ${body.error.code})`);
  return body;
}

async function graphAll(path: string, params: Record<string, string>): Promise<Json[]> {
  const rows: Json[] = [];
  let body = await graph(path, { limit: "500", ...params });
  rows.push(...(body.data ?? []));
  while (body.paging?.next) {
    const res = await fetch(body.paging.next, { cache: "no-store" });
    body = (await res.json()) as Json;
    if (body.error) throw new Error(`Meta: ${body.error.message}`);
    rows.push(...(body.data ?? []));
  }
  return rows;
}

// What counts as a "result" depends on the campaign objective.
const LEAD_TYPES = ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead", "onsite_web_lead"];
const PURCHASE_TYPES = ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"];

export function labelFor(objective: string): string {
  if (["OUTCOME_LEADS", "LEAD_GENERATION"].includes(objective)) return "Leads";
  if (["OUTCOME_SALES", "CONVERSIONS", "PRODUCT_CATALOG_SALES"].includes(objective)) return "Purchases";
  if (["OUTCOME_TRAFFIC", "LINK_CLICKS"].includes(objective)) return "Link clicks";
  if (["OUTCOME_ENGAGEMENT", "POST_ENGAGEMENT", "PAGE_LIKES", "VIDEO_VIEWS"].includes(objective)) return "Engagements";
  if (["MESSAGES"].includes(objective)) return "Conversations";
  if (["OUTCOME_AWARENESS", "REACH", "BRAND_AWARENESS"].includes(objective)) return "Results";
  return "Results";
}

function firstOf(list: Json[] | undefined, types: string[]): number {
  if (!list) return 0;
  for (const t of types) {
    const hit = list.find((a) => a.action_type === t);
    if (hit) return Number(hit.value) || 0;
  }
  return 0;
}

// Prefer Meta's own "results" metric (matches Ads Manager); fall back to actions.
function resultsOf(row: Json, objective: string): number {
  const r = row.results;
  if (Array.isArray(r) && r.length) {
    const v = r[0]?.values?.[0]?.value;
    if (v !== undefined && v !== null && !Number.isNaN(Number(v))) return Number(v);
  }
  const label = labelFor(objective);
  if (label === "Leads") return firstOf(row.actions, LEAD_TYPES);
  if (label === "Purchases") return firstOf(row.actions, PURCHASE_TYPES);
  if (label === "Link clicks") return firstOf(row.actions, ["link_click"]);
  if (label === "Engagements") return firstOf(row.actions, ["post_engagement", "video_view", "like"]);
  if (label === "Conversations") return firstOf(row.actions, ["onsite_conversion.messaging_conversation_started_7d"]);
  return firstOf(row.actions, [...LEAD_TYPES, ...PURCHASE_TYPES, "link_click"]);
}

let resultsFieldSupported = true;

async function insightsChunk(acct: string, since: string, until: string): Promise<Json[]> {
  const base = "campaign_id,campaign_name,objective,spend,impressions,clicks,actions,action_values";
  const params = { level: "campaign", time_increment: "1", time_range: JSON.stringify({ since, until }) };
  if (resultsFieldSupported) {
    try {
      return await graphAll(`act_${acct}/insights`, { ...params, fields: `${base},results` });
    } catch (e) {
      if (!String(e).includes("code 100")) throw e;
      resultsFieldSupported = false;
    }
  }
  return graphAll(`act_${acct}/insights`, { ...params, fields: base });
}

export async function metaInfo(acct: string) {
  const info = await graph(`act_${acct}`, { fields: "name,currency,account_status,timezone_name" });
  return { name: info.name ?? acct, currency: info.currency ?? "USD", timezone: info.timezone_name || "America/New_York", status: Number(info.account_status) };
}

// Daily campaign rows for [from, to], fetched in 90-day chunks.
export async function metaHistory(acct: string, from: string, to: string): Promise<{ rows: DailyRow[]; campaigns: DailyStore["campaigns"] }> {
  const rows: DailyRow[] = [];
  const campaigns: DailyStore["campaigns"] = {};
  for (let start = from; start <= to; start = addDays(start, 90)) {
    const end = addDays(start, 89) < to ? addDays(start, 89) : to;
    for (const r of await insightsChunk(acct, start, end)) {
      const objective = r.objective ?? "";
      campaigns[String(r.campaign_id)] = { name: r.campaign_name ?? String(r.campaign_id), type: objective };
      rows.push({
        d: r.date_start,
        c: String(r.campaign_id),
        s: Number(r.spend) || 0,
        i: Number(r.impressions) || 0,
        k: Number(r.clicks) || 0,
        r: resultsOf(r, objective),
        v: firstOf(r.action_values, PURCHASE_TYPES),
      });
    }
  }
  return { rows, campaigns };
}

const ACTIVE = ["ACTIVE", "WITH_ISSUES", "IN_PROCESS", "PENDING_BILLING_INFO"];
const ACCOUNT_STATUS: Record<number, string> = {
  1: "Active", 2: "Disabled", 3: "Unsettled", 7: "Pending risk review", 8: "Pending settlement",
  9: "In grace period", 100: "Pending closure", 101: "Closed", 201: "Any active", 202: "Any closed",
};

export function accountLabel(store: DailyStore, campaignIds: Iterable<string>): string {
  const labels = new Set<string>();
  for (const id of campaignIds) labels.add(labelFor(store.campaigns[id]?.type ?? ""));
  return labels.size === 1 ? [...labels][0] : labels.size === 0 ? "Results" : "Results";
}

// Current status, live campaigns and alert inputs, computed from the history store.
export async function metaStatus(acct: string, store: DailyStore, accountStatus: number): Promise<AccountReport> {
  const w = windows(store.timezone);
  const [campaigns, freqRows, acctFreq] = await Promise.all([
    graphAll(`act_${acct}/campaigns`, { fields: "id,name,effective_status,objective,daily_budget,lifetime_budget" }),
    graphAll(`act_${acct}/insights`, { level: "campaign", fields: "campaign_id,frequency", time_range: JSON.stringify({ since: w.last7[0], until: w.last7[1] }) }),
    graphAll(`act_${acct}/insights`, {
      level: "account",
      fields: "frequency",
      time_ranges: JSON.stringify([{ since: w.last7[0], until: w.last7[1] }, { since: w.prev7[0], until: w.prev7[1] }]),
    }),
  ]);
  const freqById = new Map(freqRows.map((r) => [String(r.campaign_id), Number(r.frequency) || null]));
  const y = byCampaign(store, NO_RULE, w.yesterday, w.yesterday);
  const l7 = byCampaign(store, NO_RULE, w.last7[0], w.last7[1]);
  const p7 = byCampaign(store, NO_RULE, w.prev7[0], w.prev7[1]);

  const rows: CampaignRow[] = [];
  for (const c of campaigns) {
    const id = String(c.id);
    store.campaigns[id] = { name: c.name, type: c.objective ?? store.campaigns[id]?.type ?? "" };
    const last7 = l7.get(id);
    if (!ACTIVE.includes(c.effective_status) && !(last7 && last7.spend > 0)) continue;
    rows.push({
      id,
      name: c.name,
      status: c.effective_status,
      type: c.objective ?? "",
      dailyBudget: c.daily_budget ? Number(c.daily_budget) / 100 : null,
      resultLabel: labelFor(c.objective ?? ""),
      yesterday: finalize(y.get(id) ?? { spend: 0, impressions: 0, clicks: 0, results: 0, value: 0 }),
      last7: finalize(last7 ?? { spend: 0, impressions: 0, clicks: 0, results: 0, value: 0 }, freqById.get(id) ?? null),
      prev7: finalize(p7.get(id) ?? { spend: 0, impressions: 0, clicks: 0, results: 0, value: 0 }),
      notes: [],
    });
  }

  // For live campaigns that spent nothing yesterday, check whether every ad is paused.
  await Promise.all(
    rows
      .filter((r) => ACTIVE.includes(r.status) && r.yesterday.spend === 0)
      .map(async (r) => {
        try {
          const ads = await graphAll(`${r.id}/ads`, { fields: "effective_status" });
          const running = ads.filter((a) => a.effective_status === "ACTIVE").length;
          if (ads.length > 0 && running === 0) r.notes.push(`All ${ads.length} ads are paused or not running`);
        } catch {
          /* non-fatal */
        }
      }),
  );
  rows.sort((a, b) => b.last7.spend - a.last7.spend);
  const freq = (acctFreq ?? []).map((r) => Number(r.frequency) || null);

  return {
    platform: "meta",
    id: acct,
    name: store.name,
    currency: store.currency,
    timezone: store.timezone,
    status: ACCOUNT_STATUS[accountStatus] ?? String(accountStatus),
    error: null,
    resultLabel: accountLabel(store, rows.filter((r) => r.last7.spend > 0).map((r) => r.id)),
    dates: { yesterday: w.yesterday, last7: w.last7, prev7: w.prev7, mtd: w.mtd },
    mtd: finalize(sumRange(store, NO_RULE, w.mtd[0], w.mtd[1])),
    yesterday: finalize(sumRange(store, NO_RULE, w.yesterday, w.yesterday)),
    last7: finalize(sumRange(store, NO_RULE, w.last7[0], w.last7[1]), freq[0] ?? null),
    prev7: finalize(sumRange(store, NO_RULE, w.prev7[0], w.prev7[1]), freq[1] ?? null),
    series: dailySeries(store, NO_RULE, w.series[0], w.series[1]),
    campaigns: rows,
    flags: [],
  };
}

export async function metaTokenExpiry(): Promise<{ expiresAt: string | null; error: string | null }> {
  try {
    const body = await graph("debug_token", { input_token: token() });
    const exp = Number(body.data?.expires_at ?? body.data?.data_access_expires_at ?? 0);
    return { expiresAt: exp > 0 ? new Date(exp * 1000).toISOString() : null, error: body.data?.is_valid === false ? "Token is no longer valid" : null };
  } catch (e) {
    return { expiresAt: null, error: String(e instanceof Error ? e.message : e) };
  }
}
