import type { AccountReport } from "@/lib/types";
import { AlertIcon, CheckIcon, InfoIcon } from "./Icons";

// Live alerts come from the latest refresh (recent days), independent of the date picker.
export default function Alerts({ accounts }: { accounts: AccountReport[] }) {
  const items = accounts.flatMap((a) => a.flags.map((f) => ({ ...f, tag: a.platform === "meta" ? "Meta" : "Google" })));
  const crit = items.filter((i) => i.level === "critical").length;
  const warn = items.filter((i) => i.level === "warning").length;
  if (items.length === 0) {
    return (
      <div className="card alerts">
        <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "12px 16px", color: "var(--good)" }}>
          <CheckIcon /> No live issues found
        </div>
      </div>
    );
  }
  return (
    <details className="card alerts" open={crit > 0}>
      <summary>
        <span>Needs attention</span>
        {crit > 0 && <span className="badge red">{crit} critical</span>}
        {warn > 0 && <span className="badge amber">{warn} warning{warn > 1 ? "s" : ""}</span>}
        {items.length - crit - warn > 0 && <span className="badge">{items.length - crit - warn} note{items.length - crit - warn > 1 ? "s" : ""}</span>}
        <span className="muted" style={{ fontSize: 12, fontWeight: 400 }}>based on the last 7 days</span>
        <svg className="chev" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m4 6 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </summary>
      <ul className="flags">
        {items.map((f, i) => (
          <li key={i} className={f.level}>
            {f.level === "info" ? <InfoIcon /> : <AlertIcon />}
            <span className="tag">{f.tag}</span>
            <span>{f.text}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
