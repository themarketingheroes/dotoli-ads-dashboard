import { readLatestJson } from "./store";
import type { DailyStore } from "./types";

// Raw month-to-date tables pushed by the Google Ads Script (see buildReport in the script).
interface M { cost: number; clicks: number; impr: number; conv: number; value: number }
export interface RCampaign extends M {
  id: string; name: string; channel: string; subType: string; status: string; primaryStatus: string; reasons: string;
  bidding: string; budget: number | null; is: number | ""; topIs: number | ""; absTopIs: number | ""; lostBudget: number | ""; lostRank: number | "";
}
interface RAdGroup extends M { campaignId: string; name: string }
interface RProduct extends M { campaignId: string; type1: string; type2: string; cat1: string; cat2: string; itemId?: string; title?: string }
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
  errors?: Record<string, string>; // query label -> error, from the script
}

// Month-to-date conversions per action from the stored daily history: primary (counted
// in "Conversions") vs all (includes secondary actions).
export interface ConvMix { name: string; category: string; primary: number; all: number }

export async function loadConversionMix(googleId: string, from: string, to: string): Promise<ConvMix[]> {
  const s = await readLatestJson<DailyStore>(`daily/google-${googleId}`);
  if (!s) return [];
  const agg = new Map<string, ConvMix>();
  for (const r of s.rows) {
    if (r.d < from || r.d > to) continue;
    for (const [name, v] of Object.entries(r.a ?? {})) {
      const x = agg.get(name) ?? { name, category: s.actions?.[name] ?? "", primary: 0, all: 0 };
      x.primary += v[0] ?? 0;
      x.all += v[2] ?? v[0] ?? 0;
      agg.set(name, x);
    }
  }
  return [...agg.values()];
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
const plural = (n: number, word: string) => `${n.toLocaleString("en-US", { maximumFractionDigits: 0 })} ${word}${Math.round(n) === 1 ? "" : "s"}`;
const andList = (a: string[]) => (a.length <= 1 ? a.join("") : `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}`);
const sentence = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

// Google Ads Scripts report newer status reasons as UNKNOWN; those are dropped.
const REASON: Record<string, string> = {
  BUDGET_CONSTRAINED: "budget limited", BIDDING_STRATEGY_LIMITED: "bid strategy limited", BIDDING_STRATEGY_LEARNING: "bid strategy learning",
  BIDDING_STRATEGY_MISCONFIGURED: "bid strategy misconfigured", BIDDING_STRATEGY_CONSTRAINED: "bid strategy constrained",
  HAS_ASSET_GROUPS_LIMITED_BY_POLICY: "asset groups limited by policy", HAS_ADS_LIMITED_BY_POLICY: "ads limited by policy",
  HAS_ADS_DISAPPROVED: "ads disapproved", MOST_ADS_UNDER_REVIEW: "ads under review", MISSING_INVOICE_SETUP: "billing not set up",
  CAMPAIGN_PENDING: "pending", CAMPAIGN_ENDED: "ended",
};
function statusText(c: RCampaign): string {
  const st = c.status === "ENABLED" ? c.primaryStatus || "ENABLED" : c.status;
  if (st === "ELIGIBLE" || st === "ENABLED") return "";
  const reasons = (c.reasons || "").split(",").map((s) => s.trim()).filter((s) => s && s !== "UNKNOWN" && s !== "UNSPECIFIED")
    .map((s) => REASON[s] ?? s.replace(/_/g, " ").toLowerCase());
  return sentence(st) + (reasons.length ? `: ${reasons.join(", ")}` : "");
}

// Turns a PMax listing-group tree ("Includes Product type: x", "Includes Item ID: y", ...) into readable lines.
function summarizeProducts(items: string[]): { lines: string[]; key: string } {
  const types: string[] = [];
  const other: string[] = [];
  let items_ = 0;
  let exItems = 0;
  const exOther: string[] = [];
  let all = items.length === 0;
  for (const s of items) {
    if (s === "All products") { all = true; continue; }
    const m = s.match(/^(Includes|Excludes) (.*)$/);
    if (!m) { other.push(s); continue; }
    const [kind, ...rest] = m[2].split(": ");
    const val = rest.join(": ");
    if (m[1] === "Excludes") {
      if (m[2] === "everything else") continue;
      if (kind === "Item ID") exItems++; else exOther.push(m[2]);
      continue;
    }
    if (kind === "Item ID") items_++;
    else if (kind === "Product type") types.push(val);
    else other.push(m[2]);
  }
  const lines: string[] = [];
  if (types.length) {
    const sorted = [...new Set(types)].sort((a, b) => a.localeCompare(b));
    lines.push(`${plural(sorted.length, "product type")}: ${sorted.slice(0, 8).join(", ")}${sorted.length > 8 ? ` and ${sorted.length - 8} more` : ""}`);
  }
  if (items_) lines.push(`${plural(items_, "hand-picked product")} (by item ID)`);
  lines.push(...other);
  if (exItems) lines.push(`Excludes ${plural(exItems, "product")} by item ID`);
  if (exOther.length) lines.push(`Excludes ${exOther.join(", ")}`);
  if (!lines.length || (all && !types.length && !items_ && !other.length)) lines.unshift("All products");
  const key = all && lines.length === 1 ? "all" : [...types].sort().join("|") + `#${items_}#${other.sort().join("|")}`;
  return { lines, key };
}

const CONV_LABEL: Record<string, [string, string]> = {
  PURCHASE: ["purchase", "purchases"], BEGIN_CHECKOUT: ["checkout started", "checkouts started"], ADD_TO_CART: ["add to cart", "add to carts"],
  STORE_VISIT: ["store visit", "store visits"], GET_DIRECTIONS: ["direction request", "direction requests"], PHONE_CALL_LEAD: ["phone call", "phone calls"],
  CONTACT: ["contact", "contacts"], SUBMIT_LEAD_FORM: ["lead form", "lead forms"], SIGNUP: ["sign-up", "sign-ups"], PAGE_VIEW: ["page view", "page views"],
  ENGAGEMENT: ["engagement", "engagements"], STORE_SALE: ["store sale", "store sales"], BOOK_APPOINTMENT: ["booking", "bookings"],
};

export interface CampaignLine { id: string; name: string; type: string; focus: string; budget: number | null; cost: number; conv: number; value: number; roas: number | null; status: string }
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
  categoryEmpty: string;
  productCost: number;
  conversions: { counted: string; note: string };
  brand: { brand: number; nonBrand: number; brandShare: number; termCoverage: number; pmaxEstimated: boolean; byType: { type: string; brand: number; nonBrand: number }[] } | null;
  pmax: { campaign: string; cost: number; conv: number; value: number; overlap: string; assetGroups: { name: string; status: string; strength: string; cost: number; conv: number; value: number; products: string[] }[]; topCategories: { label: string; clicks: number; conv: number }[] }[];
  opportunities: Opportunity[];
  opportunityNote: string;
  remarketing: { lists: RUserList[]; verdict: string };
  competitor: { campaigns: RAllTime[]; keywords: { text: string; clicks: number; cost: number; avgCpc: number | null; conv: number }[]; accountCpa: number | null; accountRoas: number | null; verdict: string };
  impressionShare: ISLine[];
}

const pctOf = (v: number | "" | undefined | null) => (v === "" || v === undefined || v === null ? null : Number(v) * 100);

export function buildReportView(r: RawReport, cfg: ReportConfig, mix: ConvMix[] = []): ReportView {
  const fm = (n: number, d = 0) => new Intl.NumberFormat("en-US", { style: "currency", currency: r.currency || "USD", minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
  // Google's auto-created Local Services placeholders never belong in a client report.
  const active = r.campaigns.filter((c) => (c.status === "ENABLED" || c.cost > 0) && !(c.channel === "LOCAL_SERVICES" && c.cost === 0));
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
          const k = p.type1 ? (p.type2 ? `${p.type1} > ${p.type2}` : p.type1) : p.cat1 || p.title || "Other";
          byType.set(k, (byType.get(k) ?? 0) + p.cost);
        }
        focus = topNames([...byType.entries()].map(([name, cost]) => ({ name, cost })));
      }
      return {
        id: c.id, name: c.name, type: typeName(c.channel) + (c.subType && c.subType !== "UNSPECIFIED" && c.subType !== "UNKNOWN" ? ` (${c.subType.replace(/_/g, " ").toLowerCase()})` : ""),
        focus: focus || (c.channel === "SHOPPING" ? "All products in the feed" : "–"), budget: c.budget, cost: c.cost, conv: c.conv, value: c.value, roas: roas(c),
        status: statusText(c),
      };
    })
    .sort((a, b) => b.cost - a.cost);

  // What "Conversions" means in this account: primary actions only.
  const counted = mix.filter((x) => x.primary >= 0.5).sort((a, b) => b.primary - a.primary);
  const labelOf = (x: ConvMix) => {
    const n = Math.round(x.primary);
    const l = CONV_LABEL[x.category];
    return `${n.toLocaleString("en-US")} ${l ? l[n === 1 ? 0 : 1] : `"${x.name.replace(/^.*\(web\)\s*/, "").replace(/_/g, " ")}"`}`;
  };
  const countedText = counted.length ? `"Conversions" here are Google's primary conversions: ${counted.map(labelOf).join(", ")} this month.` : "";
  const secondaryPurchases = mix.filter((x) => x.category === "PURCHASE" && x.primary < 0.5).reduce((s, x) => s + x.all, 0);
  const purchaseCounted = counted.some((x) => x.category === "PURCHASE");
  const notPurchases = counted.filter((x) => x.category !== "PURCHASE");
  const totalValue = r.campaigns.reduce((s, c) => s + c.value, 0);
  // True when ROAS is built on values assigned to non-sale actions (directions, calls, ...), not revenue.
  const valueNotRevenue = !purchaseCounted && totalValue > 0;
  let convNote = "";
  if (secondaryPurchases >= 0.5 && !purchaseCounted) {
    convNote = `Purchases are set as a secondary conversion in this account (${plural(secondaryPurchases, "purchase")} recorded this month), so Google's bidding is not optimising for them and they are not in the Conversions column. Making the purchase action primary fixes this.`;
  } else if (valueNotRevenue) {
    convNote = "None of the counted conversions are online purchases, so conversion value and ROAS in this section come from the values set on those actions in Google Ads, not from sales revenue.";
  } else if (purchaseCounted && notPurchases.length) {
    const n = notPurchases.reduce((s, x) => s + x.primary, 0);
    const all = counted.reduce((s, x) => s + x.primary, 0);
    convNote = `${Math.round(n)} of ${plural(all, "conversion")} this month ${Math.round(n) === 1 ? "is" : "are"} not a purchase (${notPurchases.map(labelOf).join(", ")}), so conversions and ROAS overstate sales.`;
  } else if (!counted.length && totalCost > 0) {
    convNote = "Google recorded no primary conversions in this account this month.";
  }
  const conversions = { counted: countedText, note: convNote };

  // 1b. Spend by product category (Shopping + Performance Max products).
  const cats = new Map<string, CategoryLine>();
  const byTitle = r.products.length > 0 && r.products.every((p) => !p.type1 && !p.cat1);
  for (const p of r.products) {
    const name = p.type1 || p.cat1 || (byTitle && p.title) || "Uncategorised";
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
  if (byTitle && categories.length) categoryNote = (categoryNote ? categoryNote + " " : "") + "Google did not return product types for this account, so spend is shown per product.";
  const retailSpend = r.campaigns.filter((c) => c.channel === "SHOPPING" || c.channel === "PERFORMANCE_MAX").reduce((s, c) => s + c.cost, 0);
  // Shopping campaigns always run on the feed, so no product rows there means the query failed.
  const shoppingSpend = r.campaigns.filter((c) => c.channel === "SHOPPING").reduce((s, c) => s + c.cost, 0);
  const productError = !r.products.length && (Object.keys(r.errors ?? {}).some((k) => k.startsWith("products")) || shoppingSpend > 0);
  const categoryEmpty = categories.length
    ? ""
    : productError
      ? "The product breakdown could not be read from Google Ads on the last run. It will appear after the next successful script run."
      : retailSpend > 0
        ? "Google reported no product-feed spend this month: the Performance Max spend here is not tied to products in the feed (for example store-visit campaigns)."
        : "No Shopping or Performance Max spend this month.";

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
    .map((c) => {
      const groups = r.assetGroups
        .filter((a) => a.campaignId === c.id)
        .sort((a, b) => (a.status === "ENABLED" ? 0 : 1) - (b.status === "ENABLED" ? 0 : 1) || b.cost - a.cost)
        .map((a) => ({ ...a, sum: summarizeProducts(a.products) }));
      // Enabled asset groups that cover exactly the same products compete with each other.
      const same = new Map<string, string[]>();
      for (const g of groups.filter((g) => g.status === "ENABLED")) same.set(g.sum.key, [...(same.get(g.sum.key) ?? []), g.name]);
      const dup = [...same.entries()].find(([, names]) => names.length > 1);
      const overlap = dup
        ? `${andList(dup[1].map((n) => `"${n}"`))} all cover the same products (${groups.find((g) => g.sum.key === dup[0])!.sum.lines[0].split(":")[0].toLowerCase()}), so Google can show any product from any of them: the split is by creative and audience signal, not by product category. If each group should push its own category, its product filter needs to include only that category.`
        : "";
      return {
        campaign: c.name,
        cost: c.cost,
        conv: c.conv,
        value: c.value,
        overlap,
        assetGroups: groups.map((a) => ({ name: a.name, status: a.status, strength: a.strength, cost: a.cost, conv: a.conv, value: a.value, products: a.sum.lines })),
        topCategories: r.pmaxInsights
          .filter((i) => i.campaignId === c.id)
          .sort((a, b) => b.clicks - a.clicks)
          .slice(0, 6)
          .map((i) => ({ label: i.label === "(other)" ? "unlabelled searches" : i.label, clicks: i.clicks, conv: i.conv })),
      };
    })
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
    .filter((x) => x.constrained && x.extra > 0);
  // Only suggest more budget where the return already holds up; otherwise budget is not the constraint.
  const worthIt = (x: (typeof candidates)[number]) => x.r >= 1 && x.r >= acctRoas * 0.8;
  const held = candidates.filter((x) => !worthIt(x));
  const ranked = candidates.filter(worthIt).sort((a, b) => b.r - a.r || b.c.conv / b.c.cost - a.c.conv / a.c.cost);
  const roasWord = valueNotRevenue ? "return on conversion value" : "ROAS";
  const opportunityNote = held.length
    ? `${andList(held.map((x) => `"${x.c.name}"`))} ${held.length === 1 ? "is" : "are"} limited by budget but ${held.length === 1 ? "returns" : "return"} ${andList(held.map((x) => `${x.r.toFixed(2)}x`))}, so more budget would mostly buy more of the same results. Improve conversion rate or tracking there before adding budget.`
    : "";
  const opportunities: Opportunity[] = ranked.slice(0, 3).map((x) => ({
    title: `Raise "${x.c.name}" budget`,
    detail:
      `${typeName(x.c.channel)}: ${plural(x.c.conv, "conversion")} this month` +
      (x.r ? ` at ${x.r.toFixed(2)}x ${roasWord} (account average ${acctRoas.toFixed(2)}x)` : "") +
      (pctOf(x.c.lostBudget) ? `, losing ${pctOf(x.c.lostBudget)!.toFixed(0)}% of impressions to budget` : ", flagged by Google as budget limited") +
      ". Increase in steps of about 10% and watch cost per conversion.",
    extraPerDay: x.extra,
    extraPerMonth: x.extra * 30,
  }));

  // 2. Remarketing audience volume.
  // The same list often appears twice (with and without "(system-defined)"); keep one.
  const uniq = new Map<string, RUserList>();
  for (const l of r.userLists) {
    const name = l.name.replace(/\s*\(system-defined\)\s*$/i, "").trim();
    const key = `${name.toLowerCase()}|${l.sizeSearch}|${l.sizeDisplay}`;
    if (!uniq.has(key)) uniq.set(key, { ...l, name });
  }
  const lists = [...uniq.values()].sort((a, b) => b.sizeDisplay - a.sizeDisplay || b.sizeSearch - a.sizeSearch).slice(0, 12);
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
  let compVerdict = "No competitor campaigns found in this account's history (none named with competitor, conquest or rival).";
  if (compCampaigns.length) {
    const cpa = cc.conv > 0 ? cc.cost / cc.conv : null;
    const ro = cc.cost > 0 && cc.value > 0 ? cc.value / cc.cost : null;
    const avgCpc = cc.clicks > 0 ? cc.cost / cc.clicks : null;
    const worse = (cpa && accountCpa && cpa > accountCpa * 2) || (ro !== null && accountRoas && ro < accountRoas / 2) || cc.conv === 0;
    compVerdict =
      `Competitor campaigns have spent ${fm(cc.cost)} in total for ${plural(cc.clicks, "click")}` +
      (avgCpc ? ` (average CPC ${fm(avgCpc, 2)})` : "") +
      ` and brought ${plural(cc.conv, "conversion")}` +
      (ro !== null ? ` at ${ro.toFixed(2)}x ROAS` : "") +
      "." +
      (accountRoas ? ` The account as a whole returns ${accountRoas.toFixed(2)}x over the same history.` : "") +
      " " +
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
    categoryEmpty,
    productCost,
    conversions,
    brand,
    pmax,
    opportunities,
    opportunityNote,
    remarketing: { lists, verdict },
    competitor: { campaigns: compCampaigns, keywords: compKw, accountCpa, accountRoas, verdict: compVerdict },
    impressionShare,
  };
}
