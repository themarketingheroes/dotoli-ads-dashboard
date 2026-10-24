import { readLatestJson } from "./store";

// Raw month-to-date tables pushed by the Google Ads Script (see buildReport in the script).
interface M { cost: number; clicks: number; impr: number; conv: number; value: number }
export interface RCampaign extends M {
  id: string; name: string; channel: string; subType: string; status: string; primaryStatus: string; reasons: string;
  bidding: string; budget: number | null; is: number | ""; topIs: number | ""; absTopIs: number | ""; lostBudget: number | ""; lostRank: number | "";
}
interface RAdGroup extends M { campaignId: string; name: string }
interface RProduct extends M { campaignId: string; type1: string; type2: string; cat1: string; cat2: string }
interface RTerm extends M { campaignId: string; term: string }
interface RInsight { campaignId: string; label: string; impr: number; clicks: number; conv: number }
interface RAssetGroup extends M { campaignId: string; id: string; name: string; status: string; strength: string; products: string[] }
interface RUserList { name: string; type: string; sizeSearch: number; sizeDisplay: number; lifeSpan: number; eligibleSearch: boolean; eligibleDisplay: boolean }
interface RAllTime extends M { id: string; name: string; channel: string; status: string }
interface RCompKw extends M { campaign: string; status: string; text: string; match: string; avgCpc: number }

export interface RawReport {
  account: string;
  currency: string;
  period: { from: string; to: string };
  generatedAt: string;
  campaigns: RCampaign[];
  adGroups: RAdGroup[];
  products: RProduct[];
  searchTerms: RTerm[];
  pmaxInsights: RInsight[];
  assetGroups: RAssetGroup[];
  userLists: RUserList[];
  allTimeCampaigns: RAllTime[];
  competitorKeywords: RCompKw[];
}

export interface ReportConfig {
  brandTerms: string[];
  priorityCategories: string[];
}

export function reportConfig(): ReportConfig {
  try {
    const c = JSON.parse(process.env.REPORT_CONFIG ?? "{}");
    return { brandTerms: c.brandTerms ?? [], priorityCategories: c.priorityCategories ?? [] };
  } catch {
    return { brandTerms: [], priorityCategories: [] };
  }
}

export function reportEnabled(): boolean {
  return process.env.DASHBOARD_REPORT === "on";
}

export async function loadReport(googleId: string): Promise<RawReport | null> {
  return readLatestJson<RawReport>(`report/google-${googleId}`);
}

const TYPE: Record<string, string> = {
  SEARCH: "Search", SHOPPING: "Shopping", PERFORMANCE_MAX: "Performance Max", DISPLAY: "Display", VIDEO: "Video",
  DEMAND_GEN: "Demand Gen", SMART: "Smart", LOCAL_SERVICES: "Local Services",
};
export const typeName = (c: string) => TYPE[c] ?? c.replace(/_/g, " ").toLowerCase();
const has = (text: string, words: string[]) => words.some((w) => w && text.toLowerCase().includes(w.toLowerCase()));
const roas = (x: { cost: number; value: number }) => (x.cost > 0 && x.value > 0 ? x.value / x.cost : null);

export interface CampaignLine { id: string; name: string; type: string; focus: string; budget: number | null; cost: number; conv: number; value: number; roas: number | null; status: string; reasons: string }
export interface CategoryLine { name: string; cost: number; share: number; conv: number; value: number; roas: number | null; priority: boolean; children: { name: string; cost: number }[] }
export interface Opportunity { title: string; detail: string; extraPerDay: number; extraPerMonth: number }
export interface ISLine { name: string; type: string; is: number | null; topIs: number | null; absTop: number | null; lostBudget: number | null; lostRank: number | null; cost: number; low: boolean }

export interface ReportView {
  account: string;
  currency: string;
  period: { from: string; to: string };
  generatedAt: string;
  totalCost: number;
  campaigns: CampaignLine[];
  categories: CategoryLine[];
  categoryNote: string;
  productCost: number;
  brand: { brand: number; nonBrand: number; brandShare: number; termCoverage: number; pmaxEstimated: boolean; byType: { type: string; brand: number; nonBrand: number }[] } | null;
  pmax: { campaign: string; cost: number; conv: number; value: number; assetGroups: { name: string; status: string; strength: string; cost: number; conv: number; value: number; products: string[] }[]; topCategories: { label: string; clicks: number; conv: number }[] }[];
  opportunities: Opportunity[];
  remarketing: { lists: RUserList[]; verdict: string };
  competitor: { campaigns: RAllTime[]; keywords: { text: string; clicks: number; cost: number; avgCpc: number | null; conv: number }[]; accountCpa: number | null; accountRoas: number | null; verdict: string };
  impressionShare: ISLine[];
}

const pctOf = (v: number | "" | undefined | null) => (v === "" || v === undefined || v === null ? null : Number(v) * 100);

export function buildReportView(r: RawReport, cfg: ReportConfig): ReportView {
  const fm = (n: number, d = 0) => new Intl.NumberFormat("en-US", { style: "currency", currency: r.currency || "USD", minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
  const active = r.campaigns.filter((c) => c.status === "ENABLED" || c.cost > 0);
  const totalCost = r.campaigns.reduce((s, c) => s + c.cost, 0);

  // 1a. Campaigns with what they focus on.
  const topNames = (items: { name: string; cost: number }[], n = 3) =>
    items.filter((x) => x.cost > 0 || items.length <= n).sort((a, b) => b.cost - a.cost).slice(0, n).map((x) => x.name).filter(Boolean).join(", ");
  const campaigns: CampaignLine[] = active
    .map((c) => {
      let focus = "";
      if (c.channel === "SEARCH") focus = topNames(r.adGroups.filter((a) => a.campaignId === c.id));
      else if (c.channel === "PERFORMANCE_MAX") focus = topNames(r.assetGroups.filter((a) => a.campaignId === c.id && a.status !== "REMOVED"));
      if (!focus && (c.channel === "SHOPPING" || c.channel === "PERFORMANCE_MAX")) {
        const byType = new Map<string, number>();
        for (const p of r.products.filter((p) => p.campaignId === c.id)) {
          const k = p.type2 ? `${p.type1} > ${p.type2}` : p.type1 || p.cat1 || "Other";
          byType.set(k, (byType.get(k) ?? 0) + p.cost);
        }
        focus = topNames([...byType.entries()].map(([name, cost]) => ({ name, cost })));
      }
      return {
        id: c.id, name: c.name, type: typeName(c.channel) + (c.subType && c.subType !== "UNSPECIFIED" && c.subType !== "UNKNOWN" ? ` (${c.subType.replace(/_/g, " ").toLowerCase()})` : ""),
        focus: focus || "Not broken down by Google", budget: c.budget, cost: c.cost, conv: c.conv, value: c.value, roas: roas(c),
        status: c.status === "ENABLED" ? c.primaryStatus || "ENABLED" : c.status, reasons: c.reasons,
      };
    })
    .sort((a, b) => b.cost - a.cost);

  // 1b. Spend by product category (Shopping + Performance Max products).
  const cats = new Map<string, CategoryLine>();
  for (const p of r.products) {
    const name = p.type1 || p.cat1 || "Uncategorised";
    const sub = p.type2 || p.cat2 || "";
    const c = cats.get(name) ?? { name, cost: 0, share: 0, conv: 0, value: 0, roas: null, priority: has(name, cfg.priorityCategories), children: [] };
    c.cost += p.cost; c.conv += p.conv; c.value += p.value;
    if (sub) {
      const ch = c.children.find((x) => x.name === sub);
      if (ch) ch.cost += p.cost; else c.children.push({ name: sub, cost: p.cost });
    }
    if (!c.priority && sub && has(sub, cfg.priorityCategories)) c.priority = true;
    cats.set(name, c);
  }
  const productCost = [...cats.values()].reduce((s, c) => s + c.cost, 0);
  const categories = [...cats.values()]
    .map((c) => ({ ...c, share: productCost > 0 ? c.cost / productCost : 0, roas: roas(c), children: c.children.sort((a, b) => b.cost - a.cost) }))
    .sort((a, b) => b.cost - a.cost);
  let categoryNote = "";
  if (categories.length && cfg.priorityCategories.length) {
    const firstNonPriority = categories.findIndex((c) => !c.priority);
    const lastPriority = categories.map((c) => c.priority).lastIndexOf(true);
    const prioShare = categories.filter((c) => c.priority).reduce((s, c) => s + c.share, 0);
    if (lastPriority === -1) categoryNote = `Flag: none of the priority categories (${cfg.priorityCategories.join(", ")}) received product spend this month.`;
    else if (firstNonPriority !== -1 && firstNonPriority < lastPriority) {
      categoryNote = `Flag: "${categories[firstNonPriority].name}" outspends at least one priority category. Priority categories took ${(prioShare * 100).toFixed(0)}% of product spend.`;
    } else categoryNote = `On track: priority categories are the heaviest spend, at ${(prioShare * 100).toFixed(0)}% of product spend.`;
  }

  // 1c. Brand vs non-brand.
  let brand: ReportView["brand"] = null;
  if (cfg.brandTerms.length) {
    const typeOf = new Map(r.campaigns.map((c) => [c.id, c.channel]));
    const termBrand = { SEARCH: 0, SHOPPING: 0 } as Record<string, number>;
    const termAll = { SEARCH: 0, SHOPPING: 0 } as Record<string, number>;
    for (const t of r.searchTerms) {
      const ch = typeOf.get(t.campaignId) ?? "";
      if (!(ch in termAll)) continue;
      termAll[ch] += t.cost;
      if (has(t.term, cfg.brandTerms)) termBrand[ch] += t.cost;
    }
    const byType: { type: string; brand: number; nonBrand: number }[] = [];
    let visible = 0;
    let measured = 0;
    for (const ch of ["SEARCH", "SHOPPING"]) {
      const spend = r.campaigns.filter((c) => c.channel === ch).reduce((s, c) => s + c.cost, 0);
      if (!spend) continue;
      const ratio = termAll[ch] > 0 ? termBrand[ch] / termAll[ch] : has(r.campaigns.filter((c) => c.channel === ch).map((c) => c.name).join(" "), cfg.brandTerms) ? 1 : 0;
      byType.push({ type: typeName(ch), brand: spend * ratio, nonBrand: spend * (1 - ratio) });
      visible += termAll[ch];
      measured += spend;
    }
    const pmaxSpend = r.campaigns.filter((c) => c.channel === "PERFORMANCE_MAX").reduce((s, c) => s + c.cost, 0);
    let pmaxEstimated = false;
    if (pmaxSpend > 0) {
      const clicks = r.pmaxInsights.reduce((s, i) => s + i.clicks, 0);
      const brandClicks = r.pmaxInsights.filter((i) => has(i.label, cfg.brandTerms)).reduce((s, i) => s + i.clicks, 0);
      const ratio = clicks > 0 ? brandClicks / clicks : 0;
      byType.push({ type: "Performance Max (estimated)", brand: pmaxSpend * ratio, nonBrand: pmaxSpend * (1 - ratio) });
      pmaxEstimated = true;
    }
    const other = totalCost - measured - pmaxSpend;
    if (other > 0.5) byType.push({ type: "Other (Display, Video, Demand Gen)", brand: 0, nonBrand: other });
    const b = byType.reduce((s, x) => s + x.brand, 0);
    const nb = byType.reduce((s, x) => s + x.nonBrand, 0);
    brand = { brand: b, nonBrand: nb, brandShare: b + nb > 0 ? b / (b + nb) : 0, termCoverage: measured > 0 ? Math.min(visible / measured, 1) : 0, pmaxEstimated, byType };
  }

  // 1d. Performance Max detail.
  const pmax = r.campaigns
    .filter((c) => c.channel === "PERFORMANCE_MAX" && (c.status === "ENABLED" || c.cost > 0))
    .map((c) => ({
      campaign: c.name,
      cost: c.cost,
      conv: c.conv,
      value: c.value,
      assetGroups: r.assetGroups
        .filter((a) => a.campaignId === c.id)
        .sort((a, b) => b.cost - a.cost)
        .map((a) => ({ name: a.name, status: a.status, strength: a.strength, cost: a.cost, conv: a.conv, value: a.value, products: a.products.length ? a.products : ["All products"] })),
      topCategories: r.pmaxInsights
        .filter((i) => i.campaignId === c.id)
        .sort((a, b) => b.clicks - a.clicks)
        .slice(0, 6)
        .map((i) => ({ label: i.label, clicks: i.clicks, conv: i.conv })),
    }))
    .sort((a, b) => b.cost - a.cost);

  // 1e. Opportunities: budget-limited campaigns that already convert, ranked by return.
  const acctRoas = totalCost > 0 ? r.campaigns.reduce((s, c) => s + c.value, 0) / totalCost : 0;
  const days = Math.max(1, Math.round((Date.parse(r.period.to) - Date.parse(r.period.from)) / 86400000) + 1);
  const candidates = r.campaigns
    .filter((c) => c.status === "ENABLED" && c.cost > 0 && c.conv > 0)
    .map((c) => {
      const lostB = pctOf(c.lostBudget) ?? 0;
      const isNow = pctOf(c.is);
      const constrained = lostB >= 10 || /BUDGET/.test(c.reasons);
      const dailyNow = c.budget ?? c.cost / days;
      // Room to grow: spend needed to win back the share lost to budget, capped at doubling.
      const growth = isNow && isNow > 0 && lostB > 0 ? Math.min(lostB / isNow, 1) : constrained ? 0.3 : 0;
      return { c, constrained, extra: dailyNow * growth, r: roas(c) ?? 0 };
    })
    .filter((x) => x.constrained && x.extra > 0)
    .sort((a, b) => b.r - a.r || b.c.conv / b.c.cost - a.c.conv / a.c.cost);
  const opportunities: Opportunity[] = candidates.slice(0, 3).map((x) => ({
    title: `Raise "${x.c.name}" budget`,
    detail:
      `${typeName(x.c.channel)}: ${x.c.conv.toFixed(0)} conversions this month` +
      (x.r ? ` at ${x.r.toFixed(2)}x ROAS (account average ${acctRoas.toFixed(2)}x)` : "") +
      (pctOf(x.c.lostBudget) ? `, losing ${pctOf(x.c.lostBudget)!.toFixed(0)}% of impressions to budget` : ", flagged by Google as budget limited") +
      ". Increase in steps and watch cost per purchase.",
    extraPerDay: x.extra,
    extraPerMonth: x.extra * 30,
  }));

  // 2. Remarketing audience volume.
  const lists = [...r.userLists].sort((a, b) => b.sizeDisplay - a.sizeDisplay).slice(0, 12);
  const biggest = lists[0];
  let verdict = "No remarketing lists found in this account.";
  if (biggest) {
    const searchOk = lists.some((l) => l.sizeSearch >= 1000);
    const displayOk = lists.some((l) => l.sizeDisplay >= 1000);
    if (searchOk && displayOk) {
      verdict = `There is enough volume for a standalone remarketing campaign (largest list "${biggest.name}": about ${biggest.sizeDisplay.toLocaleString("en-US")} people on Display/YouTube). A small, separate retargeting campaign with its own budget gives control over spend and messaging that PMax does not; keep the same lists as audience signals in PMax.`;
    } else if (displayOk) {
      verdict = `Lists are big enough for Display/YouTube retargeting but too small for Search (needs 1,000 active users). A standalone campaign is possible on Display only; otherwise keep remarketing inside PMax as audience signals and leave the main retargeting on Meta.`;
    } else {
      verdict = `Remarketing lists are below Google's 1,000-user minimum, so a standalone Google retargeting campaign would barely serve. Keep remarketing on Meta and use these lists as signals inside PMax until they grow.`;
    }
  }

  // 3. Competitor campaigns (history) and CPCs paid on competitor keywords.
  const compRe = /compet|conquest|rival/i;
  const compCampaigns = r.allTimeCampaigns.filter((c) => compRe.test(c.name)).sort((a, b) => b.cost - a.cost);
  const kwMap = new Map<string, { text: string; clicks: number; cost: number; conv: number }>();
  for (const k of r.competitorKeywords) {
    const key = k.text.toLowerCase();
    const cur = kwMap.get(key) ?? { text: k.text, clicks: 0, cost: 0, conv: 0 };
    cur.clicks += k.clicks; cur.cost += k.cost; cur.conv += k.conv;
    kwMap.set(key, cur);
  }
  const compKw = [...kwMap.values()].filter((k) => k.clicks > 0 || k.cost > 0).sort((a, b) => b.cost - a.cost).slice(0, 15)
    .map((k) => ({ ...k, avgCpc: k.clicks > 0 ? k.cost / k.clicks : null }));
  const allCost = r.allTimeCampaigns.reduce((s, c) => s + c.cost, 0);
  const allConv = r.allTimeCampaigns.reduce((s, c) => s + c.conv, 0);
  const allValue = r.allTimeCampaigns.reduce((s, c) => s + c.value, 0);
  const accountCpa = allConv > 0 ? allCost / allConv : null;
  const accountRoas = allCost > 0 && allValue > 0 ? allValue / allCost : null;
  const cc = compCampaigns.reduce((s, c) => ({ cost: s.cost + c.cost, conv: s.conv + c.conv, value: s.value + c.value, clicks: s.clicks + c.clicks }), { cost: 0, conv: 0, value: 0, clicks: 0 });
  let compVerdict = "No earlier competitor campaigns found (none named with competitor, conquest or rival).";
  if (compCampaigns.length) {
    const cpa = cc.conv > 0 ? cc.cost / cc.conv : null;
    const ro = cc.cost > 0 && cc.value > 0 ? cc.value / cc.cost : null;
    const avgCpc = cc.clicks > 0 ? cc.cost / cc.clicks : null;
    const worse = (cpa && accountCpa && cpa > accountCpa * 2) || (ro !== null && accountRoas && ro < accountRoas / 2) || cc.conv === 0;
    compVerdict =
      `Past competitor campaigns spent ${fm(cc.cost)} for ${cc.clicks.toLocaleString("en-US")} clicks` +
      (avgCpc ? ` (average CPC ${fm(avgCpc, 2)})` : "") +
      ` and ${cc.conv.toFixed(0)} conversions` +
      (ro !== null ? ` at ${ro.toFixed(2)}x ROAS` : "") +
      (accountRoas ? ` vs ${accountRoas.toFixed(2)}x for the account overall` : "") +
      ". " +
      (worse
        ? "Returns were well below the account average, so if we test again it should be a separate campaign with a small capped budget, kept out of PMax."
        : "Results held up against the account average, so a separate, capped competitor campaign (outside PMax) is worth testing.");
  }

  // 4. Impression share for Search and Shopping.
  const impressionShare: ISLine[] = r.campaigns
    .filter((c) => (c.channel === "SEARCH" || c.channel === "SHOPPING") && (c.status === "ENABLED" || c.cost > 0))
    .map((c) => {
      const is = pctOf(c.is);
      return { name: c.name, type: typeName(c.channel), is, topIs: pctOf(c.topIs), absTop: pctOf(c.absTopIs), lostBudget: pctOf(c.lostBudget), lostRank: pctOf(c.lostRank), cost: c.cost, low: is !== null && is < 10 };
    })
    .sort((a, b) => (a.is ?? 101) - (b.is ?? 101));

  return {
    account: r.account,
    currency: r.currency,
    period: r.period,
    generatedAt: r.generatedAt,
    totalCost,
    campaigns,
    categories,
    categoryNote,
    productCost,
    brand,
    pmax,
    opportunities,
    remarketing: { lists, verdict },
    competitor: { campaigns: compCampaigns, keywords: compKw, accountCpa, accountRoas, verdict: compVerdict },
    impressionShare,
  };
}
