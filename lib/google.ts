import { windows } from "./dates";
import { addRaw, finalize, Raw, seriesFrom, sumWindow, zeroRaw } from "./metrics";
import type { AccountReport, CampaignRow } from "./types";

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

export async function googleAccount(cid: string): Promise<AccountReport> {
  const [info] = await gaql(cid, "SELECT customer.descriptive_name, customer.currency_code, customer.time_zone, customer.status FROM customer");
  const c = info?.customer ?? {};
  const tz = c.timeZone || "America/New_York";
  const w = windows(tz);

  const [campaigns, daily, policy] = await Promise.all([
    gaql(cid, "SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign.primary_status, campaign.primary_status_reasons, campaign_budget.amount_micros FROM campaign WHERE campaign.status != 'REMOVED'"),
    gaql(cid, `SELECT campaign.id, segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value FROM campaign WHERE segments.date BETWEEN '${w.series[0]}' AND '${w.series[1]}'`),
    gaql(cid, "SELECT campaign.id, ad_group_ad.policy_summary.approval_status FROM ad_group_ad WHERE campaign.status = 'ENABLED' AND ad_group.status = 'ENABLED' AND ad_group_ad.status = 'ENABLED' AND ad_group_ad.policy_summary.approval_status IN ('DISAPPROVED', 'APPROVED_LIMITED')").catch(() => [] as Json[]),
  ]);

  const perCampaign = new Map<string, Map<string, Raw>>();
  const accountDays = new Map<string, Raw>();
  for (const r of daily) {
    const id = String(r.campaign?.id);
    const date = r.segments?.date as string;
    const m = r.metrics ?? {};
    const raw: Raw = {
      spend: Number(m.costMicros ?? 0) / 1e6,
      impressions: Number(m.impressions ?? 0),
      clicks: Number(m.clicks ?? 0),
      results: Number(m.conversions ?? 0),
      value: Number(m.conversionsValue ?? 0),
    };
    if (!perCampaign.has(id)) perCampaign.set(id, new Map());
    const days = perCampaign.get(id)!;
    days.set(date, addRaw(days.get(date) ?? zeroRaw(), raw));
    accountDays.set(date, addRaw(accountDays.get(date) ?? zeroRaw(), raw));
  }

  const policyCount = new Map<string, { disapproved: number; limited: number }>();
  for (const p of policy) {
    const id = String(p.campaign?.id);
    const s = p.adGroupAd?.policySummary?.approvalStatus;
    const cur = policyCount.get(id) ?? { disapproved: 0, limited: 0 };
    if (s === "DISAPPROVED") cur.disapproved++;
    else cur.limited++;
    policyCount.set(id, cur);
  }

  const rows: CampaignRow[] = [];
  for (const r of campaigns) {
    const camp = r.campaign ?? {};
    const id = String(camp.id);
    const days = perCampaign.get(id) ?? new Map<string, Raw>();
    const l7 = sumWindow(days, w.last7[0], w.last7[1]);
    const off = camp.status !== "ENABLED" || ["ENDED", "REMOVED"].includes(camp.primaryStatus);
    if (off && l7.spend === 0) continue;
    if (camp.advertisingChannelType === "LOCAL_SERVICES" && l7.spend === 0) continue; // auto-created placeholder
    const notes: string[] = [];
    const reasons: string[] = (camp.primaryStatusReasons ?? []).filter((r: string) => !IGNORE_REASONS.includes(r));
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
      type: CHANNEL[camp.advertisingChannelType] ?? camp.advertisingChannelType ?? "",
      dailyBudget: r.campaignBudget?.amountMicros ? Number(r.campaignBudget.amountMicros) / 1e6 : null,
      resultLabel: "Conversions",
      yesterday: finalize(sumWindow(days, w.yesterday, w.yesterday)),
      last7: finalize(l7),
      prev7: finalize(sumWindow(days, w.prev7[0], w.prev7[1])),
      notes,
    });
  }
  rows.sort((a, b) => b.last7.spend - a.last7.spend);

  return {
    platform: "google",
    id: cid,
    name: c.descriptiveName || `Google Ads ${cid.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3")}`,
    currency: c.currencyCode ?? "USD",
    timezone: tz,
    status: c.status === "ENABLED" ? "Active" : (c.status ?? "Unknown"),
    error: null,
    resultLabel: "Conversions",
    dates: { yesterday: w.yesterday, last7: w.last7, prev7: w.prev7 },
    yesterday: finalize(sumWindow(accountDays, w.yesterday, w.yesterday)),
    last7: finalize(sumWindow(accountDays, w.last7[0], w.last7[1])),
    prev7: finalize(sumWindow(accountDays, w.prev7[0], w.prev7[1])),
    series: seriesFrom(accountDays, w.series[0], w.series[1]),
    campaigns: rows,
    flags: [],
  };
}
