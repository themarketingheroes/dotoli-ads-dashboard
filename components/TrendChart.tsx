"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DayPoint } from "@/lib/types";

type MetricKey = "spend" | "results" | "cpr" | "clicks" | "revenue";

interface Props {
  series: DayPoint[];
  cSeries: DayPoint[] | null;
  currency: string;
  resultLabel: string;
  compareLabel: string | null;
  ecommerce?: boolean;
}

const H = 240;
const PAD = { top: 12, right: 12, bottom: 26, left: 56 };

function fmtMoney(n: number, currency: string, compact = false) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, notation: compact ? "compact" : "standard", maximumFractionDigits: compact ? 1 : n >= 1000 ? 0 : 2 }).format(n);
  } catch {
    return n.toFixed(0);
  }
}
function fmtNum(n: number, compact = false) {
  return new Intl.NumberFormat("en-US", { notation: compact ? "compact" : "standard", maximumFractionDigits: 1 }).format(n);
}
function fmtDate(d: string) {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function value(p: DayPoint, m: MetricKey): number | null {
  if (m === "spend") return p.spend;
  if (m === "results") return p.results;
  if (m === "clicks") return p.clicks;
  if (m === "revenue") return p.value ?? 0;
  return p.results > 0 ? p.spend / p.results : null;
}

function niceMax(v: number) {
  if (v <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * exp;
}

export default function TrendChart({ series, cSeries, currency, resultLabel, compareLabel, ecommerce }: Props) {
  const [metric, setMetric] = useState<MetricKey>("spend");
  const [hover, setHover] = useState<number | null>(null);
  const [width, setWidth] = useState(800);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver((e) => setWidth(Math.max(280, e[0].contentRect.width)));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  const tabs: { id: MetricKey; label: string }[] = ecommerce
    ? [
        { id: "spend", label: "Spend" },
        { id: "revenue", label: "Revenue" },
        { id: "results", label: "Purchases" },
        { id: "cpr", label: "Cost per purchase" },
        { id: "clicks", label: "Clicks" },
      ]
    : [
        { id: "spend", label: "Spend" },
        { id: "results", label: resultLabel },
        { id: "cpr", label: "Cost per result" },
        { id: "clicks", label: "Clicks" },
      ];
  const isMoney = metric === "spend" || metric === "cpr" || metric === "revenue";
  const fmt = (n: number, compact = false) => (isMoney ? fmtMoney(n, currency, compact) : fmtNum(n, compact));

  const cur = useMemo(() => series.map((p) => value(p, metric)), [series, metric]);
  const cmp = useMemo(() => (cSeries ? cSeries.map((p) => value(p, metric)) : null), [cSeries, metric]);
  const n = Math.max(series.length, cmp?.length ?? 0, 2);
  const max = niceMax(Math.max(0, ...cur.filter((v): v is number => v !== null), ...(cmp ?? []).filter((v): v is number => v !== null)));
  const iw = width - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (n === 1 ? 0 : (i / (n - 1)) * iw);
  const y = (v: number) => PAD.top + ih - (v / max) * ih;

  function path(vals: (number | null)[]) {
    let d = "";
    let pen = false;
    vals.forEach((v, i) => {
      if (v === null) { pen = false; return; }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  }
  const curPath = path(cur);
  const areaPath = metric === "cpr" ? "" : `${curPath} L${x(cur.length - 1)},${PAD.top + ih} L${x(0)},${PAD.top + ih} Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const labelEvery = Math.max(1, Math.ceil(series.length / Math.max(2, Math.floor(iw / 80))));

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    const rect = (e.target as SVGRectElement).getBoundingClientRect();
    const px = e.clientX - rect.left;
    const i = Math.round((px / rect.width) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  }

  const hv = hover !== null ? cur[hover] ?? null : null;
  const hc = hover !== null && cmp ? cmp[hover] ?? null : null;
  const tipLeft = hover !== null ? Math.min(Math.max(x(hover) + 12, 0), width - 180) : 0;

  return (
    <div className="card chart-card">
      <div className="chart-top">
        <div className="tabs" role="tablist" aria-label="Chart metric">
          {tabs.map((t) => (
            <button key={t.id} role="tab" aria-selected={metric === t.id} className={`tab${metric === t.id ? " on" : ""}`} onClick={() => setMetric(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="legend">
          <span><i className="key" /> Selected period</span>
          {cmp && <span><i className="key cmp" /> {compareLabel ?? "Comparison"}</span>}
        </div>
      </div>
      <div className="chart-wrap" ref={wrap}>
        <svg viewBox={`0 0 ${width} ${H}`} role="img" aria-label={`${tabs.find((t) => t.id === metric)?.label} by day`}>
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
              <text className="axis" x={PAD.left - 8} y={y(t) + 4} textAnchor="end">{fmt(t, true)}</text>
            </g>
          ))}
          {series.map((p, i) =>
            i % labelEvery === 0 ? (
              <text key={p.date} className="axis" x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : "middle"}>
                {fmtDate(p.date)}
              </text>
            ) : null,
          )}
          {cmp && <path d={path(cmp)} fill="none" stroke="var(--compare)" strokeWidth={1.5} strokeDasharray="4 4" strokeLinejoin="round" />}
          {areaPath && <path d={areaPath} fill="var(--chart-fill)" />}
          <path d={curPath} fill="none" stroke="var(--chart)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {hover !== null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + ih} stroke="var(--border-2)" strokeWidth={1} />
              {hc !== null && <circle cx={x(hover)} cy={y(hc)} r={4} fill="var(--bg)" stroke="var(--compare)" strokeWidth={2} />}
              {hv !== null && <circle cx={x(hover)} cy={y(hv)} r={4.5} fill="var(--chart)" stroke="var(--bg)" strokeWidth={2} />}
            </g>
          )}
          <rect
            x={PAD.left}
            y={PAD.top}
            width={iw}
            height={ih}
            fill="transparent"
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
            style={{ cursor: "crosshair" }}
          />
        </svg>
        {hover !== null && (
          <div className="tip" style={{ left: tipLeft, top: 8 }}>
            {series[hover] && (
              <>
                <div className="t-date">{fmtDate(series[hover].date)}</div>
                <div className="t-row">
                  <span><i className="key" /> </span>
                  <b>{hv === null ? "–" : fmt(hv)}</b>
                </div>
              </>
            )}
            {cmp && cSeries?.[hover] && (
              <>
                <div className="t-date" style={{ marginTop: 6 }}>{fmtDate(cSeries[hover].date)}</div>
                <div className="t-row">
                  <span><i className="key cmp" /> </span>
                  <b>{hc === null ? "–" : fmt(hc)}</b>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
