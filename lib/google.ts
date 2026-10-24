import { byCampaign, dailySeries, sumRange } from "./aggregate";
import { windows } from "./dates";
import { finalize, zeroRaw } from "./metrics";
import type { AccountReport, CampaignRow, DailyRow, DailyStore, GoogleAccountConfig } from "./types";

const VERSION = process.env.GOOGLE_ADS_API_VERSION || "v25";

type Json = Record<string, any>;

let cached: { token: string; until: number } | null = null;

async function accessToken(): Promise<string> {
  if (cached && cached.until > Date.now() + 60_000) return cached.token;
  const { GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN } = process.env;
  if (!GOOGLE_ADS_CLIENT_ID || !GOOGLE_ADS_CLIENT_SECRET || !GOOGLE_ADS_REFRESH_TOKEN) {
    throw new Error("Google Ads credentials are not set");
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_ADS_CLIENT_ID,
      client_secret: GOOGLE_ADS_CLIENT_SECRET,
      refresh_token: GOOGLE_ADS_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  const body = (await res.json()) as Json;
  if (!body.access_token) throw new Error(`Google sign-in failed: ${body.error_description ?? body.error ?? res.status}`);
  cached = { token: body.access_token, until: Date.now() + Number(body.expires_in ?? 3000) * 1000 };
  return cached.token;
}

async function gaql(cid: string, query: string): Promise<Json[]> {
  const rows: Json[] = [];
  let pageToken: string | undefined;
  do {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${await accessToken()}`,
      "Content-Type": "application/json",
    };
    if (process.env.GOOGLE_ADS_DEVELOPER_TOKEN) headers["developer-token"] = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    if (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID) headers["login-customer-id"] = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
    const res = await fetch(`https://googleads.googleapis.com/${VERSION}/customers/${cid}/googleAds:search`, {
      method: "POST",
      headers,
      body: JSON.stringify(pageToken ? { query, pageToken } : { query }),
      cache: "no-store",
    });
    const body = (await res.json()) as Json;
    if (!res.ok) {
      const detail = body?.error?.details?.[0]?.errors?.[0]?.message ?? body?.error?.message ?? res.statusText;
      throw new Error(`Google Ads: ${detail}`);
    }
    rows.push(...(body.results ?? []));
    pageToken = body.nextPageToken;
  } while (pageToken);
  return rows;
}

const IGNORE_REASONS = ["UNSPECIFIED", "UNKNOWN"];
const titleCase = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

const CHANNEL: Record<string, string> = {
  SEARCH: "Search", PERFORMANCE_MAX: "Performance Max", DISPLAY: "Display", VIDEO: "Video",
  DEMAND_GEN: "Demand Gen", SHOPPING: "Shopping", LOCAL_SERVICES: "Local Services", SMART: "Smart",
};

export async function googleInfo(cid: string) {
  const [info] = await gaql(cid, "SELECT customer.descriptive_name, customer.currency_code, customer.time_zone, customer.status FROM customer");
  const c = info?.customer ?? {};
  return {
    name: (c.descriptiveName as string) || "",
    currency: c.currencyCode ?? "USD",
    timezone: c.timeZone || "America/New_York",
    status: c.status === "ENABLED" ? "Active" : (c.status ?? "Unknown"),
  };
}

// Daily campaign rows for [from, to], with conversions split by conversion action
// so the counting rule can change later without refetching.
export async function googleHistory(cid: string, from: string, to: string): Promise<{ rows: DailyRow[]; campaigns: DailyStore["campaigns"]; actions: Record<string, string> }> {
  const [perf, conv] = await Promise.all([
    gaql(cid, `SELECT campaign.id, campaign.name, campaign.advertising_channel_type, segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks FROM campaign WHERE segments.date BETWEEN '${from}' AND '${to}'`),
    gaql(cid, `SELECT campaign.id, segments.date, segments.conversion_action_name, segments.conversion_action_category, metrics.conversions, metrics.conversions_value, metrics.all_conversions FROM campaign WHERE segments.date BETWEEN '${from}' AND '${to}' AND metrics.all_conversions > 0`),
  ]);
  const campaigns: DailyStore["campaigns"] = {};
  const actions: Record<string, string> = {};
  const rows = new Map<string, DailyRow>();
  const key = (d: string, c: string) => `${d}|${c}`;
  for (const r of perf) {
    const c = String(r.campaign?.id);
    const d = r.segments?.date as string;
    campaigns[c] = { name: r.campaign?.name ?? c, type: CHANNEL[r.campaign?.advertisingChannelType] ?? r.campaign?.advertisingChannelType ?? "" };
    const m = r.metrics ?? {};
    rows.set(key(d, c), { d, c, s: Number(m.costMicros ?? 0) / 1e6, i: Number(m.impressions ?? 0), k: Number(m.clicks ?? 0), r: 0, v: 0, a: {} });
  }
  for (const r of conv) {
    const c = String(r.campaign?.id);
    const d = r.segments?.date as string;
    const name = r.segments?.conversionActionName as string;
    actions[name] = r.segments?.conversionActionCategory ?? "";
    const row = rows.get(key(d, c)) ?? { d, c, s: 0, i: 0, k: 0, r: 0, v: 0, a: {} };
    const prev = row.a![name] ?? [0, 0, 0];
    row.a![name] = [prev[0] + Number(r.metrics?.conversions ?? 0), prev[1] + Number(r.metrics?.conversionsValue ?? 0), (prev[2] ?? 0) + Number(r.metrics?.allConversions ?? 0)];
    rows.set(key(d, c), row);
  }
  return { rows: [...rows.values()], campaigns, actions };
}

// Script-fed accounts: same report, built only from what the Google Ads Script pushed.
export function googleStatusFromStore(cfg: GoogleAccountConfig, store: DailyStore): AccountReport {
  const w = windows(store.timezone);
  const label = cfg.label ?? "Conversions";
  const y = byCampaign(store, cfg, w.yesterday, w.yesterday);
  const l7 = byCampaign(store, cfg, w.last7[0], w.last7[1]);
  const p7 = byCampaign(store, cfg, w.prev7[0], w.prev7[1]);
  const rows: CampaignRow[] = [];
  for (const c of store.live ?? []) {
    const last7 = l7.get(c.id) ?? zeroRaw();
    const off = c.status !== "ENABLED" || ["ENDED", "REMOVED"].includes(c.primaryStatus);
    if (off && last7.spend === 0) continue;
    if (c.channel === "LOCAL_SERVICES" && last7.spend === 0) continue;
    const notes: string[] = [];
    const reasons = (c.reasons || "").split(",").map((x) => x.trim()).filter((x) => x && !IGNORE_REASONS.includes(x));
    if (["NOT_ELIGIBLE", "LIMITED", "MISCONFIGURED", "PENDING"].includes(c.primaryStatus) && reasons.length) {
      notes.push(`${titleCase(c.primaryStatus)}: ${reasons.map(titleCase).join(", ")}`);
    }
    rows.push({
      id: c.id,
      name: c.name,
      status: c.status === "ENABLED" ? (c.primaryStatus || "ENABLED") : c.status,
      type: CHANNEL[c.channel] ?? c.channel,
      dailyBudget: c.budget,
      resultLabel: label,
      yesterday: finalize(y.get(c.id) ?? zeroRaw()),
      last7: finalize(last7),
      prev7: finalize(p7.get(c.id) ?? zeroRaw()),
      notes,
    });
  }
  rows.sort((a, b) => b.last7.spend - a.last7.spend);
  const stale = store.updatedAt && Date.now() - Date.parse(store.updatedAt) > 36 * 3600 * 1000;
  return {
    platform: "google",
    id: cfg.id,
    name: store.name,
    currency: store.currency,
    timezone: store.timezone,
    status: "Active",
    error: null,
    resultLabel: label,
    dates: { yesterday: w.yesterday, last7: w.last7, prev7: w.prev7, mtd: w.mtd },
    mtd: finalize(sumRange(store, cfg, w.mtd[0], w.mtd[1])),
    yesterday: finalize(sumRange(store, cfg, w.yesterday, w.yesterday)),
    last7: finalize(sumRange(store, cfg, w.last7[0], w.last7[1])),
    prev7: finalize(sumRange(store, cfg, w.prev7[0], w.prev7[1])),
    series: dailySeries(store, cfg, w.series[0], w.series[1]),
    campaigns: rows,
    flags: stale ? [{ level: "warning", text: `Google Ads data last arrived ${new Date(store.updatedAt).toUTCString()}. Check the Google Ads Script is still scheduled daily.` }] : [],
  };
}

export async function googleStatus(cfg: GoogleAccountConfig, store: DailyStore, accountStatus: string): Promise<AccountReport> {
  const cid = cfg.id;
  const w = windows(store.timezone);
  const label = cfg.label ?? "Conversions";
  const [campaigns, policy] = await Promise.all([
    gaql(cid, "SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign.primary_status, campaign.primary_status_reasons, campaign_budget.amount_micros FROM campaign WHERE campaign.status != 'REMOVED'"),
    gaql(cid, "SELECT campaign.id, ad_group_ad.policy_summary.approval_status FROM ad_group_ad WHERE campaign.status = 'ENABLED' AND ad_group.status = 'ENABLED' AND ad_group_ad.status = 'ENABLED' AND ad_group_ad.policy_summary.approval_status IN ('DISAPPROVED', 'APPROVED_LIMITED')").catch(() => [] as Json[]),
  ]);

  const policyCount = new Map<string, { disapproved: number; limited: number }>();
  for (const p of policy) {
    const id = String(p.campaign?.id);
    const cur = policyCount.get(id) ?? { disapproved: 0, limited: 0 };
    if (p.adGroupAd?.policySummary?.approvalStatus === "DISAPPROVED") cur.disapproved++;
    else cur.limited++;
    policyCount.set(id, cur);
  }

  const y = byCampaign(store, cfg, w.yesterday, w.yesterday);
  const l7 = byCampaign(store, cfg, w.last7[0], w.last7[1]);
  const p7 = byCampaign(store, cfg, w.prev7[0], w.prev7[1]);

  const rows: CampaignRow[] = [];
  for (const r of campaigns) {
    const camp = r.campaign ?? {};
    const id = String(camp.id);
    const type = CHANNEL[camp.advertisingChannelType] ?? camp.advertisingChannelType ?? "";
    store.campaigns[id] = { name: camp.name ?? id, type };
    const last7 = l7.get(id) ?? zeroRaw();
    const off = camp.status !== "ENABLED" || ["ENDED", "REMOVED"].includes(camp.primaryStatus);
    if (off && last7.spend === 0) continue;
    if (camp.advertisingChannelType === "LOCAL_SERVICES" && last7.spend === 0) continue; // auto-created placeholder
    const notes: string[] = [];
    const reasons: string[] = (camp.primaryStatusReasons ?? []).filter((x: string) => !IGNORE_REASONS.includes(x));
    if (["NOT_ELIGIBLE", "LIMITED", "MISCONFIGURED", "PENDING"].includes(camp.primaryStatus) && reasons.length) {
      notes.push(`${titleCase(camp.primaryStatus)}: ${reasons.map(titleCase).join(", ")}`);
    }
    const pc = policyCount.get(id);
    if (pc?.disapproved) notes.push(`${pc.disapproved} disapproved ad${pc.disapproved > 1 ? "s" : ""}`);
    if (pc?.limited) notes.push(`${pc.limited} ad${pc.limited > 1 ? "s" : ""} approved (limited)`);
    rows.push({
      id,
      name: camp.name ?? id,
      status: camp.status === "ENABLED" ? (camp.primaryStatus ?? "ENABLED") : camp.status,
      type,
      dailyBudget: r.campaignBudget?.amountMicros ? Number(r.campaignBudget.amountMicros) / 1e6 : null,
      resultLabel: label,
      yesterday: finalize(y.get(id) ?? zeroRaw()),
      last7: finalize(last7),
      prev7: finalize(p7.get(id) ?? zeroRaw()),
      notes,
    });
  }
  rows.sort((a, b) => b.last7.spend - a.last7.spend);

  return {
    platform: "google",
    id: cid,
    name: store.name,
    currency: store.currency,
    timezone: store.timezone,
    status: accountStatus,
    error: null,
    resultLabel: label,
    dates: { yesterday: w.yesterday, last7: w.last7, prev7: w.prev7, mtd: w.mtd },
    mtd: finalize(sumRange(store, cfg, w.mtd[0], w.mtd[1])),
    yesterday: finalize(sumRange(store, cfg, w.yesterday, w.yesterday)),
    last7: finalize(sumRange(store, cfg, w.last7[0], w.last7[1])),
    prev7: finalize(sumRange(store, cfg, w.prev7[0], w.prev7[1])),
    series: dailySeries(store, cfg, w.series[0], w.series[1]),
    campaigns: rows,
    flags: [],
  };
}
