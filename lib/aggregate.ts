import { addRaw, Raw, round, zeroRaw } from "./metrics";
import type { ConversionRule, DailyRow, DailyStore, DayPoint } from "./types";

// Engagement-style Google conversions never count as results unless asked for.
export const DEFAULT_EXCLUDE = ["ENGAGEMENT", "YOUTUBE_FOLLOW_ON_VIEWS", "PAGE_VIEW"];

export function counts(action: string, category: string | undefined, rule: ConversionRule): boolean {
  const keys = [action.toLowerCase(), (category ?? "").toLowerCase()];
  const hit = (list: string[]) => list.some((x) => keys.includes(x.toLowerCase()));
  if (rule.include?.length) return hit(rule.include);
  return !hit(rule.exclude ?? DEFAULT_EXCLUDE);
}

function rowRaw(row: DailyRow, store: DailyStore, rule: ConversionRule): Raw {
  if (store.platform === "meta" || !row.a) return { spend: row.s, impressions: row.i, clicks: row.k, results: row.r, value: row.v };
  let results = 0;
  let value = 0;
  for (const [name, [conv, val]] of Object.entries(row.a)) {
    if (counts(name, store.actions?.[name], rule)) {
      results += conv;
      value += val;
    }
  }
  return { spend: row.s, impressions: row.i, clicks: row.k, results, value };
}

export function sumRange(store: DailyStore, rule: ConversionRule, from: string, to: string): Raw {
  let acc = zeroRaw();
  for (const row of store.rows) if (row.d >= from && row.d <= to) acc = addRaw(acc, rowRaw(row, store, rule));
  return acc;
}

export function byCampaign(store: DailyStore, rule: ConversionRule, from: string, to: string): Map<string, Raw> {
  const out = new Map<string, Raw>();
  for (const row of store.rows) {
    if (row.d < from || row.d > to) continue;
    out.set(row.c, addRaw(out.get(row.c) ?? zeroRaw(), rowRaw(row, store, rule)));
  }
  return out;
}

export function dailySeries(store: DailyStore, rule: ConversionRule, from: string, to: string): DayPoint[] {
  const byDay = new Map<string, Raw>();
  for (const row of store.rows) {
    if (row.d < from || row.d > to) continue;
    byDay.set(row.d, addRaw(byDay.get(row.d) ?? zeroRaw(), rowRaw(row, store, rule)));
  }
  const out: DayPoint[] = [];
  const d = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  while (d <= end) {
    const key = d.toISOString().slice(0, 10);
    const r = byDay.get(key) ?? zeroRaw();
    out.push({ date: key, spend: round(r.spend), results: round(r.results), clicks: r.clicks, impressions: r.impressions });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export interface ActionLine {
  name: string;
  category: string;
  conversions: number;
  counted: boolean;
}

export function actionBreakdown(store: DailyStore, rule: ConversionRule, from: string, to: string): ActionLine[] {
  const totals = new Map<string, number>();
  for (const row of store.rows) {
    if (row.d < from || row.d > to || !row.a) continue;
    for (const [name, [conv]] of Object.entries(row.a)) totals.set(name, (totals.get(name) ?? 0) + conv);
  }
  return [...totals.entries()]
    .filter(([, n]) => n > 0)
    .map(([name, conversions]) => ({ name, category: store.actions?.[name] ?? "", conversions: round(conversions), counted: counts(name, store.actions?.[name], rule) }))
    .sort((a, b) => Number(b.counted) - Number(a.counted) || b.conversions - a.conversions);
}
