// All reporting windows are computed in each ad account's own time zone, so
// "yesterday" always means a fully closed day for that account.

export function todayIn(tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function windows(tz: string) {
  const yesterday = addDays(todayIn(tz), -1);
  return {
    yesterday,
    last7: [addDays(yesterday, -6), yesterday] as [string, string],
    prev7: [addDays(yesterday, -13), addDays(yesterday, -7)] as [string, string],
    series: [addDays(yesterday, -29), yesterday] as [string, string],
  };
}
