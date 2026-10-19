export function money(n: number, currency = "USD", digits?: number): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: digits ?? (Math.abs(n) >= 1000 ? 0 : 2),
      maximumFractionDigits: digits ?? (Math.abs(n) >= 1000 ? 0 : 2),
    }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

export function num(n: number, digits = 0): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(n);
}

export function pct(n: number | null, digits = 2): string {
  return n === null ? "–" : `${n.toFixed(digits)}%`;
}

export function delta(now: number | null, before: number | null): number | null {
  if (now === null || before === null || before === 0) return null;
  return ((now - before) / before) * 100;
}

export function shortDate(d: string): string {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function relativeTime(iso: string): string {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function titleCase(s: string): string {
  return s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}
