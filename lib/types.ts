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
  mtd?: Metrics; // month to date (optional so older snapshots still render)
  yesterday: Metrics;
  last7: Metrics;
  prev7: Metrics;
  series: DayPoint[];
  campaigns: CampaignRow[];
  flags: Flag[];
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

export interface ClientConfig {
  slug: string;
  name: string;
  meta: string[];
  google: string[];
}

export interface AccessEntry {
  email: string;
  clients: "all" | string[];
  addedAt: string;
}
