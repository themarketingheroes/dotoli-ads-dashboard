import type { DayPoint, Metrics } from "./types";

export interface Raw {
  spend: number;
  impressions: number;
  clicks: number;
  results: number;
  value: number;
}

export const zeroRaw = (): Raw => ({ spend: 0, impressions: 0, clicks: 0, results: 0, value: 0 });

export function addRaw(a: Raw, b: Raw): Raw {
  return {
    spend: a.spend + b.spend,
    impressions: a.impressions + b.impressions,
    clicks: a.clicks + b.clicks,
    results: a.results + b.results,
    value: a.value + b.value,
  };
}

export function finalize(r: Raw, frequency: number | null = null): Metrics {
  return {
    spend: round(r.spend),
    impressions: r.impressions,
    clicks: r.clicks,
    ctr: r.impressions > 0 ? (r.clicks / r.impressions) * 100 : null,
    cpc: r.clicks > 0 ? r.spend / r.clicks : null,
    cpm: r.impressions > 0 ? (r.spend / r.impressions) * 1000 : null,
    frequency,
    results: round(r.results),
    costPerResult: r.results > 0 ? r.spend / r.results : null,
    value: round(r.value),
    roas: r.spend > 0 && r.value > 0 ? r.value / r.spend : null,
  };
}

// Sum daily rows (keyed by date) into the yesterday / last 7 / prior 7 windows.
export function sumWindow(days: Map<string, Raw>, from: string, to: string): Raw {
  let acc = zeroRaw();
  for (const [date, raw] of days) if (date >= from && date <= to) acc = addRaw(acc, raw);
  return acc;
}

export function seriesFrom(days: Map<string, Raw>, from: string, to: string): DayPoint[] {
  const out: DayPoint[] = [];
  const d = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  while (d <= end) {
    const key = d.toISOString().slice(0, 10);
    const r = days.get(key) ?? zeroRaw();
    out.push({ date: key, spend: round(r.spend), results: round(r.results), clicks: r.clicks, impressions: r.impressions });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export function round(n: number): number {
  return Math.round(n * 100) / 100;
}
