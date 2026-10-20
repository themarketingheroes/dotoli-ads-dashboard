"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { COMPARES, CompareMode, Preset, PRESETS, rangeQuery } from "@/lib/range";

interface Props {
  preset: Preset;
  from: string;
  to: string;
  compare: CompareMode;
  label: string;
  compareLabel: string | null;
}

const Check = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="m3.5 8.5 3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function DateControl(p: Props) {
  const router = useRouter();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(p.from);
  const [to, setTo] = useState(p.to);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setFrom(p.from);
    setTo(p.to);
  }, [p.from, p.to]);

  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, []);

  function go(next: Partial<Props>) {
    const q = rangeQuery({ preset: next.preset ?? p.preset, from: next.from ?? p.from, to: next.to ?? p.to, compare: next.compare ?? p.compare });
    setOpen(false);
    router.push(`${path}${q}`);
  }

  const presetLabel = p.preset === "custom" ? "Custom" : PRESETS.find((x) => x.id === p.preset)?.label;

  return (
    <div className="dc" ref={ref}>
      <button className="dc-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="dialog">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <rect x="2" y="3" width="12" height="11" rx="2" />
          <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" strokeLinecap="round" />
        </svg>
        <span style={{ textAlign: "left", lineHeight: 1.2 }}>
          <span style={{ fontWeight: 500 }}>{presetLabel}</span> <span className="sub">{p.label}</span>
          {p.compareLabel && (
            <span className="sub" style={{ display: "block" }}>
              vs {p.compareLabel}
            </span>
          )}
        </span>
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <path d="m4 6 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="dc-pop" role="dialog" aria-label="Date range">
          <div className="dc-sec">
            <div className="dc-title">Date range</div>
            {PRESETS.map((x) => (
              <button key={x.id} className={`dc-item${p.preset === x.id ? " on" : ""}`} onClick={() => go({ preset: x.id })}>
                {x.label}
                {p.preset === x.id && <Check />}
              </button>
            ))}
          </div>
          <div className="dc-sec">
            <div className="dc-title">Custom range</div>
            <div className="dc-custom">
              <input className="input" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
              <input className="input" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} aria-label="To" />
              <button className="btn primary" onClick={() => from && to && go({ preset: "custom", from, to })}>
                Apply
              </button>
            </div>
          </div>
          <div className="dc-sec">
            <div className="dc-title">Compare to</div>
            {COMPARES.map((x) => (
              <button key={x.id} className={`dc-item${p.compare === x.id ? " on" : ""}`} onClick={() => go({ compare: x.id })}>
                {x.label}
                {p.compare === x.id && <Check />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
