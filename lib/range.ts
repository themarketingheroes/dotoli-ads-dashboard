import { addDays, todayIn } from "./dates";

export type Preset = "mtd" | "last_month" | "last7" | "last30" | "last90" | "ytd" | "custom";
export type CompareMode = "prev" | "yoy" | "none";

export interface Range {
  preset: Preset;
  from: string;
  to: string;
  compare: CompareMode;
  cFrom: string | null;
  cTo: string | null;
  label: string;
  compareLabel: string | null;
}

export const PRESETS: { id: Preset; label: string }[] = [
  { id: "mtd", label: "Month to date" },
  { id: "last_month", label: "Last month" },
  { id: "last7", label: "Last 7 days" },
  { id: "last30", label: "Last 30 days" },
  { id: "last90", label: "Last 90 days" },
  { id: "ytd", label: "Year to date" },
];

export const COMPARES: { id: CompareMode; label: string }[] = [
  { id: "prev", label: "Previous period" },
  { id: "yoy", label: "Same period last year" },
  { id: "none", label: "No comparison" },
];

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function monthStart(d: string) {
  return `${d.slice(0, 8)}01`;
}
function lastDayOfMonth(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-based
}
function shiftMonths(d: string, n: number, clampDay = true): string {
  const [y, m, day] = d.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const ny = t.getUTCFullYear();
  const nm = t.getUTCMonth() + 1;
  const dd = clampDay ? Math.min(day, lastDayOfMonth(ny, nm)) : day;
  return `${ny}-${String(nm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}
function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000) + 1;
}

export function fmtDay(d: string, withYear = false) {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" });
}
export function fmtRange(a: string, b: string) {
  const sameYear = a.slice(0, 4) === b.slice(0, 4);
  if (a === b) return fmtDay(a, true);
  return `${fmtDay(a, !sameYear)} to ${fmtDay(b, true)}`;
}

export function resolveRange(sp: Record<string, string | string[] | undefined>, tz = "America/New_York"): Range {
  const get = (k: string) => (Array.isArray(sp[k]) ? (sp[k] as string[])[0] : (sp[k] as string | undefined));
  const today = todayIn(tz);
  let preset = (get("range") as Preset) || "mtd";
  const compare = (["prev", "yoy", "none"].includes(get("compare") ?? "") ? get("compare") : "prev") as CompareMode;
  let from: string;
  let to: string;
  let cFrom: string | null = null;
  let cTo: string | null = null;

  switch (preset) {
    case "last_month": {
      const s = shiftMonths(monthStart(today), -1);
      from = s;
      to = addDays(monthStart(today), -1);
      if (compare === "prev") { cFrom = shiftMonths(s, -1); cTo = addDays(s, -1); }
      break;
    }
    case "last7":
    case "last30":
    case "last90": {
      const n = preset === "last7" ? 7 : preset === "last30" ? 30 : 90;
      to = addDays(today, -1);
      from = addDays(to, -(n - 1));
      break;
    }
    case "ytd":
      from = `${today.slice(0, 4)}-01-01`;
      to = today;
      break;
    case "custom": {
      const f = get("from");
      const t = get("to");
      if (f && t && ISO.test(f) && ISO.test(t)) {
        from = f <= t ? f : t;
        to = f <= t ? t : f;
        break;
      }
      preset = "mtd";
      from = monthStart(today);
      to = today;
      break;
    }
    default:
      preset = "mtd";
      from = monthStart(today);
      to = today;
      // Month to date compares with the same days of last month.
      if (compare === "prev") { cFrom = shiftMonths(from, -1); cTo = shiftMonths(to, -1); }
  }

  if (compare === "prev" && !cFrom) {
    const n = daysBetween(from, to);
    cTo = addDays(from, -1);
    cFrom = addDays(cTo, -(n - 1));
  }
  if (compare === "yoy") {
    cFrom = shiftMonths(from, -12);
    cTo = shiftMonths(to, -12);
  }

  return {
    preset,
    from,
    to,
    compare,
    cFrom,
    cTo,
    label: fmtRange(from, to),
    compareLabel: cFrom && cTo ? fmtRange(cFrom, cTo) : null,
  };
}

export function rangeQuery(r: Pick<Range, "preset" | "from" | "to" | "compare">): string {
  const p = new URLSearchParams();
  if (r.preset !== "mtd") p.set("range", r.preset);
  if (r.preset === "custom") { p.set("from", r.from); p.set("to", r.to); }
  if (r.compare !== "prev") p.set("compare", r.compare);
  const s = p.toString();
  return s ? `?${s}` : "";
}
