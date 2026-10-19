import { money } from "./format";
import type { AccountReport, Flag } from "./types";

const META_LIVE = ["ACTIVE", "WITH_ISSUES", "IN_PROCESS"];
const GOOGLE_OFF = ["PAUSED", "REMOVED", "ENDED", "PENDING"];

function isLive(a: AccountReport, status: string): boolean {
  return a.platform === "meta" ? META_LIVE.includes(status) : !GOOGLE_OFF.includes(status);
}

function pctChange(now: number | null, before: number | null): number | null {
  if (now === null || before === null || before === 0) return null;
  return ((now - before) / before) * 100;
}

export function flagAccount(a: AccountReport): Flag[] {
  const f: Flag[] = [];
  const cur = a.currency;

  if (a.error) return [{ level: "critical", text: a.error }];
  if (a.status !== "Active") f.push({ level: "critical", text: `Account status: ${a.status}` });

  for (const c of a.campaigns) {
    if (isLive(a, c.status) && c.yesterday.spend === 0) {
      const budget = c.dailyBudget ? ` (budget ${money(c.dailyBudget, cur)}/day)` : "";
      const why = c.notes.find((n) => n.includes("paused") || /^(Not eligible|Limited|Misconfigured|Pending):/.test(n));
      f.push({ level: "critical", text: `"${c.name}" is on but spent nothing yesterday${budget}${why ? `. ${why}` : ""}` });
    }
    for (const n of c.notes) if (n.includes("disapproved")) f.push({ level: "critical", text: `"${c.name}": ${n}` });
    if (c.status === "WITH_ISSUES" || c.status === "PENDING_BILLING_INFO") f.push({ level: "critical", text: `"${c.name}" status: ${c.status.replace(/_/g, " ").toLowerCase()}` });

    const cpr = pctChange(c.last7.costPerResult, c.prev7.costPerResult);
    if (cpr !== null && cpr > 30 && c.last7.spend > 0) f.push({ level: "warning", text: `"${c.name}": cost per ${c.resultLabel.toLowerCase().replace(/s$/, "")} up ${cpr.toFixed(0)}% vs prior 7 days (${money(c.prev7.costPerResult!, cur)} to ${money(c.last7.costPerResult!, cur)})` });
    if (c.last7.spend > 0 && c.last7.results === 0 && c.prev7.results > 0) f.push({ level: "warning", text: `"${c.name}": ${money(c.last7.spend, cur)} spent in 7 days with 0 ${c.resultLabel.toLowerCase()} (had ${c.prev7.results} the week before)` });
    const ctr = pctChange(c.last7.ctr, c.prev7.ctr);
    if (ctr !== null && ctr < -25 && c.last7.impressions > 500) f.push({ level: "warning", text: `"${c.name}": CTR down ${Math.abs(ctr).toFixed(0)}% vs prior 7 days` });
    if (a.platform === "meta" && c.last7.frequency !== null && c.last7.frequency > 3) f.push({ level: "warning", text: `"${c.name}": frequency ${c.last7.frequency.toFixed(1)} in 7 days, creative fatigue risk` });
    if (a.platform === "google" && c.last7.clicks >= 10 && c.last7.results / c.last7.clicks > 0.3) f.push({ level: "info", text: `"${c.name}": ${((c.last7.results / c.last7.clicks) * 100).toFixed(0)}% conversion rate, likely counting a soft action (not real leads)` });
  }

  // Pacing: yesterday's spend vs the summed daily budgets of live campaigns.
  // Skipped when anything that spent yesterday has no daily budget (lifetime or ad set budgets).
  const budgets = a.campaigns.filter((c) => c.dailyBudget && isLive(a, c.status)).reduce((s, c) => s + (c.dailyBudget ?? 0), 0);
  const unbudgeted = a.campaigns.some((c) => c.yesterday.spend > 0 && !c.dailyBudget);
  if (budgets > 0 && a.yesterday.spend > 0 && !unbudgeted) {
    const ratio = a.yesterday.spend / budgets;
    if (ratio < 0.7) f.push({ level: "warning", text: `Under-pacing: spent ${money(a.yesterday.spend, cur)} yesterday vs ${money(budgets, cur)} in daily budgets (${(ratio * 100).toFixed(0)}%)` });
    if (ratio > 1.3) f.push({ level: "warning", text: `Over-pacing: spent ${money(a.yesterday.spend, cur)} yesterday vs ${money(budgets, cur)} in daily budgets (${(ratio * 100).toFixed(0)}%)` });
  }

  const order = { critical: 0, warning: 1, info: 2 };
  return f.sort((x, y) => order[x.level] - order[y.level]);
}
