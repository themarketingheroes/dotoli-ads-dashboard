import { actionBreakdown, ActionLine, byCampaign, dailySeries, sumRange } from "./aggregate";
import { googleRule } from "./config";
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
  historyFrom: string | null;
}

const empty = (): Metrics => finalize(zeroRaw());

export async function accountView(report: AccountReport, range: Range, withDetail = true): Promise<AccountView> {
  const store = report.error ? null : await loadStore(report.platform, report.id);
  const rule: ConversionRule = report.platform === "google" ? googleRule(report.id) : {};
  const base = {
    platform: report.platform,
    id: report.id,
    name: report.name && report.name !== report.id ? report.name : "",
    currency: report.currency,
    status: report.status,
    error: report.error,
    flags: report.flags,
    rule: report.platform === "google" ? rule : null,
  };
  if (!store) {
    return { ...base, resultLabel: report.resultLabel, cur: empty(), prev: null, series: [], cSeries: null, campaigns: [], actions: null, historyFrom: null };
  }

  const hasCompare = !!(range.cFrom && range.cTo);
  const cur = finalize(sumRange(store, rule, range.from, range.to));
  const prev = hasCompare ? finalize(sumRange(store, rule, range.cFrom!, range.cTo!)) : null;

  let campaigns: CampaignView[] = [];
  let resultLabel = report.platform === "google" ? (rule.label ?? "Conversions") : "Results";
  const curByC = byCampaign(store, rule, range.from, range.to);

  if (report.platform === "meta") {
    const labels = new Set([...curByC.entries()].filter(([, r]) => r.spend > 0).map(([id]) => labelFor(store.campaigns[id]?.type ?? "")));
    resultLabel = labels.size === 1 ? [...labels][0] : report.resultLabel || "Results";
  }

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
          resultLabel: report.platform === "google" ? (rule.label ?? "Conversions") : labelFor(store.campaigns[id]?.type ?? lc?.type ?? ""),
          notes: lc?.notes ?? [],
          cur: finalize(c ?? zeroRaw()),
          prev: hasCompare ? finalize(p ?? zeroRaw()) : null,
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
    historyFrom: store.from,
  };
}
