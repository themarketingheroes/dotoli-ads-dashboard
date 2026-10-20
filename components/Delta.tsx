// Percent change chip. "higher" = up is good, "lower" = down is good (costs),
// "neutral" = no judgement (spend).
export type Goodness = "higher" | "lower" | "neutral";

export default function Delta({ now, before, good = "higher" }: { now: number | null; before: number | null; good?: Goodness }) {
  if (now === null || before === null) return null;
  if (before === 0) {
    if (now === 0) return <span className="delta neutral">0%</span>;
    return <span className="delta neutral">new</span>;
  }
  const d = ((now - before) / before) * 100;
  const flat = Math.abs(d) < 0.5;
  const cls = good === "neutral" || flat ? "neutral" : (good === "higher") === d > 0 ? "good" : "bad";
  const pct = Math.abs(d) >= 1000 ? `${(Math.abs(d) / 100).toFixed(0)}x` : `${Math.abs(d).toFixed(Math.abs(d) < 10 ? 1 : 0)}%`;
  return (
    <span className={`delta ${cls}`} aria-label={`${d > 0 ? "up" : "down"} ${pct}`}>
      {flat ? "" : d > 0 ? "▲" : "▼"}
      {flat ? "0%" : pct}
    </span>
  );
}
