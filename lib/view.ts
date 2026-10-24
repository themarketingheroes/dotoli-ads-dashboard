import { actionBreakdown, ActionLine, byCampaign, dailySeries, ECOM_FUNNEL, funnelTotals, FunnelTotals, sumRange } from "./aggregate";
import { accountRule } from "./config";
import { addDays } from "./dates";
import { loadStore } from "./history";
import { labelFor } from "./meta";
import { finalize, zeroRaw } from "./metrics";
import type { Range } from "./range";
import type { AccountReport, ConversionRule, DayPoint, Flag, Metrics, Platform } from "./types";

export interface CampaignView {
  id: string;
  name: string;
  type: string;
  status: string; // live status from the latest refresh, or "OFF"
  dailyBudget: number | null;
  resultLabel: string;
  notes: string[];
  cur: Metrics;
  prev: Metrics | null;
  funnel: FunnelTotals | null; // e-commerce: step key -> [count, value]
}

export interface FunnelStepView {
  key: string;
  label: string;
  cur: number;
  prev: number | null;
}

export interface AccountView {
  platform: Platform;
  id: string;
  name: string;
  currency: string;
  status: string;
  error: string | null;
  resultLabel: string;
  flags: Flag[];
  cur: Metrics;
  prev: Metrics | null;
  series: DayPoint[];
  cSeries: DayPoint[] | null;
  campaigns: CampaignView[];
  actions: ActionLine[] | null;
  rule: ConversionRule | null;
  ecommerce: boolean;
  funnel: FunnelStepView[] | null; // steps with any activity in either period
  historyFrom: string | null;
}

const empty = (): Metrics => finalize(zeroRaw());

export async function accountView(report: AccountReport, range: Range, withDetail = true): Promise<AccountView> {
  const store = report.error ? null : await loadStore(report.platform, report.id);
  const rule = accountRule(report.platform, report.id);
  const ecommerce = !!rule.ecommerce;
  const base = {
    platform: report.platform,
    id: report.id,
    name: report.name && report.name !== report.id ? report.name : "",
    currency: report.currency,
    status: report.status,
    error: report.error,
    flags: report.flags,
    rule: report.platform === "google" ? rule : null,
    ecommerce,
  };
  if (!store) {
    return { ...base, resultLabel: report.resultLabel, cur: empty(), prev: null, series: [], cSeries: null, campaigns: [], actions: null, funnel: null, historyFrom: null };
  }

  const hasCompare = !!(range.cFrom && range.cTo);
  const cur = finalize(sumRange(store, rule, range.from, range.to));
  const prev = hasCompare ? finalize(sumRange(store, rule, range.cFrom!, range.cTo!)) : null;
  const curByC = byCampaign(store, rule, range.from, range.to);

  let resultLabel = ecommerce ? "Purchases" : report.platform === "google" ? (rule.label ?? "Conversions") : "Results";
  if (!ecommerce && report.platform === "meta") {
    const labels = new Set([...curByC.entries()].filter(([, r]) => r.spend > 0).map(([id]) => labelFor(store.campaigns[id]?.type ?? "")));
    resultLabel = labels.size === 1 ? [...labels][0] : report.resultLabel || "Results";
  }

  let funnel: FunnelStepView[] | null = null;
  let campFunnel = new Map<string, FunnelTotals>();
  if (ecommerce) {
    const f = funnelTotals(store, range.from, range.to);
    const pf = hasCompare ? funnelTotals(store, range.cFrom!, range.cTo!).account : null;
    campFunnel = f.byCampaign;
    funnel = ECOM_FUNNEL.map((s) => ({ key: s.key, label: s.label, cur: f.account[s.key][0], prev: pf ? pf[s.key][0] : null }))
      // Quick Shop only appears when the account tracks it; core steps always show.
      .filter((s) => s.key !== "quick" || s.cur > 0 || (s.prev ?? 0) > 0);
  }

  let campaigns: CampaignView[] = [];
  if (withDetail) {
    const prevByC = hasCompare ? byCampaign(store, rule, range.cFrom!, range.cTo!) : new Map();
    const live = new Map(report.campaigns.map((c) => [c.id, c]));
    const ids = new Set<string>([...curByC.keys(), ...live.keys()]);
    campaigns = [...ids]
      .map((id) => {
        const lc = live.get(id);
        const c = curByC.get(id);
        const p = prevByC.get(id);
        return {
          id,
          name: lc?.name ?? store.campaigns[id]?.name ?? id,
          type: lc?.type ?? store.campaigns[id]?.type ?? "",
          status: lc?.status ?? "OFF",
          dailyBudget: lc?.dailyBudget ?? null,
          resultLabel: ecommerce ? "Purchases" : report.platform === "google" ? (rule.label ?? "Conversions") : labelFor(store.campaigns[id]?.type ?? lc?.type ?? ""),
          notes: lc?.notes ?? [],
          cur: finalize(c ?? zeroRaw()),
          prev: hasCompare ? finalize(p ?? zeroRaw()) : null,
          funnel: ecommerce ? (campFunnel.get(id) ?? null) : null,
        };
      })
      // Live campaigns with no activity only matter when the range reaches the present.
      .filter((c) => c.cur.spend > 0 || c.cur.results > 0 || (c.status !== "OFF" && range.to >= addDays(store.to, -2)))
      .sort((a, b) => b.cur.spend - a.cur.spend);
  }

  return {
    ...base,
    resultLabel,
    cur,
    prev,
    series: dailySeries(store, rule, range.from, range.to),
    cSeries: hasCompare ? dailySeries(store, rule, range.cFrom!, range.cTo!) : null,
    campaigns,
    actions: withDetail && report.platform === "google" ? actionBreakdown(store, rule, range.from, range.to) : null,
    funnel,
    historyFrom: store.from,
  };
}
