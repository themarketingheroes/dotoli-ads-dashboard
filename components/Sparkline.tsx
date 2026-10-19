import type { DayPoint } from "@/lib/types";

export default function Sparkline({ points, field }: { points: DayPoint[]; field: "spend" | "results" | "clicks" }) {
  const W = 200;
  const H = 36;
  if (points.length < 2) return <svg viewBox={`0 0 ${W} ${H}`} />;
  const values = points.map((p) => p[field]);
  const max = Math.max(...values, 0.0001);
  const step = W / (values.length - 1);
  const y = (v: number) => H - 2 - (v / max) * (H - 4);
  const line = values.map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Last 30 days of ${field}`}>
      <path d={area} fill="var(--chart-fill)" />
      <path d={line} fill="none" stroke="var(--chart)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}
