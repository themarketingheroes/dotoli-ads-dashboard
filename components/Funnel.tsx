import { money, num } from "@/lib/format";
import type { FunnelStepView } from "@/lib/view";
import Delta from "./Delta";

// Shopping funnel: each step's count, change, cost per step and step-to-step rate.
export default function Funnel({ steps, spend, currency }: { steps: FunnelStepView[]; spend: number; currency: string }) {
  const top = Math.max(...steps.map((s) => s.cur), 0);
  return (
    <div className="card funnel">
      <div className="funnel-head">
        <h3>Shopping funnel</h3>
        <span className="muted">Each step&apos;s cost and its rate from the step before</span>
      </div>
      <div className="funnel-steps" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((s, i) => {
          const before = i > 0 ? steps[i - 1].cur : null;
          const rate = before && before > 0 ? (s.cur / before) * 100 : null;
          return (
            <div key={s.key} className="fstep">
              <div className="label">{s.label}</div>
              <div className="value">{num(s.cur, 1)}</div>
              <div className="cmp">
                <Delta now={s.cur} before={s.prev} />
                {s.prev !== null && <span>vs {num(s.prev, 1)}</span>}
              </div>
              <div className="fbar"><i style={{ width: `${top > 0 ? Math.max((s.cur / top) * 100, s.cur > 0 ? 2 : 0) : 0}%` }} /></div>
              <div className="fmeta">
                <span>{s.cur > 0 ? `${money(spend / s.cur, currency)} each` : "No events"}</span>
                {rate !== null && <span>{rate.toFixed(rate < 10 ? 1 : 0)}% of {steps[i - 1].label.toLowerCase()}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
