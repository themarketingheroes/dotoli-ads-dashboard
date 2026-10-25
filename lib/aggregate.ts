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

// ---------- E-commerce funnel ----------
// Meta: action types in priority order (first one present wins, so Meta's
// overlapping omni/pixel types are never double counted).
// Google: conversion action names or categories (summed). "~text" = name contains text.
export interface FunnelStep {
  key: string;
  label: string;
  meta: string[];
  google: string[];
}

export const ECOM_FUNNEL: FunnelStep[] = [
  { key: "quick", label: "Quick Shop", meta: ["~quick"], google: ["~quick"] },
  { key: "atc", label: "Add to cart", meta: ["omni_add_to_cart", "add_to_cart", "offsite_conversion.fb_pixel_add_to_cart"], google: ["ADD_TO_CART"] },
  { key: "checkout", label: "Checkouts", meta: ["omni_initiated_checkout", "initiate_checkout", "offsite_conversion.fb_pixel_initiate_checkout"], google: ["BEGIN_CHECKOUT"] },
  { key: "purchase", label: "Purchases", meta: ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"], google: ["PURCHASE"] },
];

function stepFromRow(row: DailyRow, store: DailyStore, step: FunnelStep): [number, number] {
  const a = row.a;
  if (!a) return [0, 0];
  if (store.platform === "meta") {
    let n = 0;
    let v = 0;
    for (const m of step.meta) {
      if (m.startsWith("~")) {
        const needle = m.slice(1).toLowerCase();
        for (const [type, x] of Object.entries(a)) {
          const label = (store.actions?.[type] ?? type).toLowerCase();
          if (type.toLowerCase().includes(needle) || label.includes(needle)) { n += x[0] ?? 0; v += x[1] ?? 0; }
        }
        if (n > 0) return [n, v];
      } else if (a[m]) {
        return [a[m][0] ?? 0, a[m][1] ?? 0];
      }
    }
    return [n, v];
  }
  // Google: primary conversions when the action is primary, otherwise all conversions.
  let primary = 0, primaryV = 0, all = 0, allV = 0;
  for (const [name, x] of Object.entries(a)) {
    const cat = (store.actions?.[name] ?? "").toLowerCase();
    const lname = name.toLowerCase();
    const match = step.google.some((g) => (g.startsWith("~") ? lname.includes(g.slice(1).toLowerCase()) : g.toLowerCase() === cat || g.toLowerCase() === lname));
    if (!match) continue;
    primary += x[0] ?? 0;
    primaryV += x[1] ?? 0;
    all += x[2] ?? x[0] ?? 0;
    allV += x[1] ?? 0;
  }
  return primary > 0 ? [primary, primaryV] : [all, allV];
}

const PURCHASE = ECOM_FUNNEL.find((s) => s.key === "purchase")!;

function rowRaw(row: DailyRow, store: DailyStore, rule: ConversionRule): Raw {
  const base = { spend: row.s, impressions: row.i, clicks: row.k };
  if (rule.ecommerce) {
    const [n, v] = stepFromRow(row, store, PURCHASE);
    return { ...base, results: n, value: v };
  }
  if (store.platform === "meta" || !row.a) return { ...base, results: row.r, value: row.v };
  let results = 0;
  let value = 0;
  for (const [name, x] of Object.entries(row.a)) {
    if (counts(name, store.actions?.[name], rule)) {
      results += x[0] ?? 0;
      value += x[1] ?? 0;
    }
  }
  return { ...base, results, value };
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

export type FunnelTotals = Record<string, [number, number]>; // step key -> [count, value]

export function funnelTotals(store: DailyStore, from: string, to: string): { account: FunnelTotals; byCampaign: Map<string, FunnelTotals> } {
  const account: FunnelTotals = {};
  const camp = new Map<string, FunnelTotals>();
  for (const s of ECOM_FUNNEL) account[s.key] = [0, 0];
  for (const row of store.rows) {
    if (row.d < from || row.d > to || !row.a) continue;
    const c = camp.get(row.c) ?? Object.fromEntries(ECOM_FUNNEL.map((s) => [s.key, [0, 0]])) as FunnelTotals;
    for (const s of ECOM_FUNNEL) {
      const [n, v] = stepFromRow(row, store, s);
      account[s.key][0] += n; account[s.key][1] += v;
      c[s.key][0] += n; c[s.key][1] += v;
    }
    camp.set(row.c, c);
  }
  return { account, byCampaign: camp };
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
    out.push({ date: key, spend: round(r.spend), results: round(r.results), clicks: r.clicks, impressions: r.impressions, value: round(r.value) });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export interface ActionLine {
  name: string;
  category: string;
  conversions: number;
  counted: boolean;
  step?: string; // e-commerce: which funnel step this action feeds
}

function googleStepFor(name: string, category: string): string | undefined {
  const lname = name.toLowerCase();
  const cat = category.toLowerCase();
  return ECOM_FUNNEL.find((s) => s.google.some((g) => (g.startsWith("~") ? lname.includes(g.slice(1).toLowerCase()) : g.toLowerCase() === cat || g.toLowerCase() === lname)))?.label;
}

export function actionBreakdown(store: DailyStore, rule: ConversionRule, from: string, to: string): ActionLine[] {
  const totals = new Map<string, number>();
  for (const row of store.rows) {
    if (row.d < from || row.d > to || !row.a) continue;
    for (const [name, x] of Object.entries(row.a)) totals.set(name, (totals.get(name) ?? 0) + (rule.ecommerce ? (x[2] ?? x[0] ?? 0) : (x[0] ?? 0)));
  }
  return [...totals.entries()]
    .filter(([, n]) => n > 0)
    .map(([name, conversions]) => {
      const category = store.actions?.[name] ?? "";
      const step = rule.ecommerce ? googleStepFor(name, category) : undefined;
      return { name, category, conversions: round(conversions), counted: rule.ecommerce ? !!step : counts(name, category, rule), step };
    })
    .sort((a, b) => Number(b.counted) - Number(a.counted) || b.conversions - a.conversions);
}

// ---------- Conversion lines (overview cards) ----------
// Each conversion type the account records, highest first. Google: the account's
// counted (primary) actions; e-commerce accounts also show cart/checkout/purchase
// steps from all conversions, so secondary purchase tracking still shows up.
const GOOGLE_LABEL: Record<string, string> = {
  PURCHASE: "Purchases", BEGIN_CHECKOUT: "Checkouts", ADD_TO_CART: "Add to cart", STORE_VISIT: "Store visits",
  GET_DIRECTIONS: "Directions", PHONE_CALL_LEAD: "Calls", CONTACT: "Contacts", SUBMIT_LEAD_FORM: "Leads",
  SIGNUP: "Sign-ups", BOOK_APPOINTMENT: "Bookings", STORE_SALE: "Store sales", REQUEST_QUOTE: "Quote requests",
  QUALIFIED_LEAD: "Qualified leads", CONVERTED_LEAD: "Converted leads", ADD_PAYMENT_INFO: "Payment info",
};

export interface ConversionLine { label: string; cur: number; prev: number | null }

function googleLines(store: DailyStore, rule: ConversionRule, from: string, to: string): Map<string, number> {
  // action -> [primary, all]
  const tot = new Map<string, [number, number]>();
  for (const row of store.rows) {
    if (row.d < from || row.d > to || !row.a) continue;
    for (const [name, x] of Object.entries(row.a)) {
      const t = tot.get(name) ?? [0, 0];
      t[0] += x[0] ?? 0;
      t[1] += x[2] ?? x[0] ?? 0;
      tot.set(name, t);
    }
  }
  // label -> actions in it
  const groups = new Map<string, { primary: number; all: number; isPrimary: boolean }[]>();
  for (const [name, [primary, all]] of tot) {
    const category = store.actions?.[name] ?? "";
    if (!counts(name, category, { exclude: rule.exclude, include: rule.include })) continue;
    const step = googleStepFor(name, category);
    const label = step === "Quick Shop" ? step : GOOGLE_LABEL[category] ?? name.replace(/^.*\(web\)\s*/, "").replace(/_/g, " ");
    const ecomStep = rule.ecommerce && !!step;
    if (primary <= 0 && !ecomStep) continue;
    groups.set(label, [...(groups.get(label) ?? []), { primary, all, isPrimary: primary > 0 }]);
  }
  const out = new Map<string, number>();
  for (const [label, acts] of groups) {
    const prim = acts.filter((a) => a.isPrimary);
    // E-commerce steps use all conversions (Google's "All conv."); several trackers
    // for the same step (e.g. Google tag + GA4 purchase) are not added together.
    const n = rule.ecommerce
      ? prim.length ? prim.reduce((s, a) => s + a.all, 0) : Math.max(...acts.map((a) => a.all))
      : prim.reduce((s, a) => s + a.primary, 0);
    if (n > 0) out.set(label, n);
  }
  return out;
}

function metaLines(store: DailyStore, rule: ConversionRule, from: string, to: string): Map<string, number> {
  const out = new Map<string, number>();
  if (rule.ecommerce) {
    const f = funnelTotals(store, from, to).account;
    for (const s of ECOM_FUNNEL) if (f[s.key][0] > 0) out.set(s.key === "atc" ? "Add to cart" : s.label, f[s.key][0]);
  } else {
    const r = sumRange(store, rule, from, to).results;
    if (r > 0) out.set("Results", r);
  }
  return out;
}

export function conversionLines(store: DailyStore, rule: ConversionRule, from: string, to: string, cFrom?: string, cTo?: string): ConversionLine[] {
  const fn = store.platform === "meta" ? metaLines : googleLines;
  const cur = fn(store, rule, from, to);
  const prev = cFrom && cTo ? fn(store, rule, cFrom, cTo) : null;
  return [...cur.entries()]
    .map(([label, n]) => ({ label, cur: round(n), prev: prev ? round(prev.get(label) ?? 0) : null }))
    .sort((a, b) => b.cur - a.cur);
}
