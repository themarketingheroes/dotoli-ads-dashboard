export type Platform = "meta" | "google";

export interface Metrics {
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number | null; // percent
  cpc: number | null;
  cpm: number | null;
  frequency: number | null; // Meta only
  results: number;
  costPerResult: number | null;
  value: number; // purchase / conversion value
  roas: number | null;
}

export interface DayPoint {
  date: string; // YYYY-MM-DD
  value?: number;
  spend: number;
  results: number;
  clicks: number;
  impressions: number;
}

export interface CampaignRow {
  id: string;
  name: string;
  status: string;
  type: string; // Meta objective or Google channel type
  dailyBudget: number | null;
  resultLabel: string;
  yesterday: Metrics;
  last7: Metrics;
  prev7: Metrics;
  notes: string[];
}

export interface Flag {
  level: "critical" | "warning" | "info";
  text: string;
}

// Latest status of one ad account (alerts, campaign statuses, budgets).
export interface AccountReport {
  platform: Platform;
  id: string;
  name: string;
  currency: string;
  timezone: string;
  status: string;
  error: string | null;
  resultLabel: string;
  dates: { yesterday: string; last7: [string, string]; prev7: [string, string]; mtd?: [string, string] };
  mtd?: Metrics;
  yesterday: Metrics;
  last7: Metrics;
  prev7: Metrics;
  series: DayPoint[];
  campaigns: CampaignRow[];
  flags: Flag[];
  rule?: ConversionRule; // counting rule used for this account (set at refresh)
}

export interface ClientReport {
  slug: string;
  name: string;
  meta: AccountReport[];
  google: AccountReport[];
}

export interface Snapshot {
  generatedAt: string;
  trigger: "cron" | "manual";
  durationMs: number;
  metaToken: { expiresAt: string | null; error: string | null };
  clients: ClientReport[];
}

// Which Google conversion actions count as results. Matches action names or
// categories (e.g. "SIGNUP"). include wins over exclude.
export interface ConversionRule {
  include?: string[];
  exclude?: string[];
  label?: string;
  ecommerce?: boolean; // results = purchases, value = purchase value, funnel shown
}

export interface GoogleAccountConfig extends ConversionRule {
  id: string; // may be "" when the account is matched by name (script-fed accounts)
  name?: string;
  // "script": data is pushed by a Google Ads Script to /api/ingest (for logins that block API apps)
  source?: "api" | "script";
}

export interface LiveCampaign {
  id: string;
  name: string;
  status: string;
  primaryStatus: string;
  reasons: string;
  channel: string;
  budget: number | null;
}

export interface ClientConfig {
  slug: string;
  name: string;
  meta: string[];
  google: GoogleAccountConfig[];
  ecommerce?: boolean;
}

export interface AccessEntry {
  email: string;
  clients: "all" | string[];
  addedAt: string;
}

// ---------- Daily history (powers any date range) ----------

export interface DailyRow {
  d: string; // date
  c: string; // campaign id
  s: number; // spend
  i: number; // impressions
  k: number; // clicks
  r: number; // results (Meta); unused for Google, which uses a
  v: number; // value (Meta); unused for Google
  // Google: conversion action -> [conversions, value, all conversions]
  // Meta: action type -> [count, value]
  a?: Record<string, number[]>;
}

export interface DailyStore {
  platform: Platform;
  id: string;
  name: string;
  currency: string;
  timezone: string;
  updatedAt: string;
  from: string;
  to: string;
  campaigns: Record<string, { name: string; type: string }>;
  version?: number; // bumped when the stored shape changes (forces a full refetch)
  actions?: Record<string, string>; // Google: action name -> category. Meta: action type -> display name
  live?: LiveCampaign[]; // script-fed accounts: campaign settings from the latest push
  rows: DailyRow[];
}
