import { delta, money, num, pct, shortDate, titleCase } from "@/lib/format";
import type { AccountReport, Metrics } from "@/lib/types";
import { AlertIcon, CheckIcon, InfoIcon } from "./Icons";
import Sparkline from "./Sparkline";

// For cost metrics a decrease is good; for everything else an increase is good.
function Delta({ now, before, lowerIsBetter = false, neutral = false }: { now: number | null; before: number | null; lowerIsBetter?: boolean; neutral?: boolean }) {
  const d = delta(now, before);
  if (d === null) return <span className="flat">no prior data</span>;
  const good = lowerIsBetter ? d < 0 : d > 0;
  const cls = neutral || Math.abs(d) < 1 ? "flat" : good ? "up" : "down";
  return (
    <span className={`${cls} mono`}>
      {d > 0 ? "+" : ""}
      {d.toFixed(0)}%
    </span>
  );
}

function Kpi({ label, value, now, before, lowerIsBetter, neutral, children }: { label: string; value: string; now: number | null; before: number | null; lowerIsBetter?: boolean; neutral?: boolean; children?: React.ReactNode }) {
  return (
    <div className="kpi">
      <div className="label">{label}</div>
      <div className="value mono">{value}</div>
      <div className="sub">
        <Delta now={now} before={before} lowerIsBetter={lowerIsBetter} neutral={neutral} />
        <span className="flat">vs prior 7 days</span>
      </div>
      {children}
    </div>
  );
}

function statusBadge(status: string) {
  const s = status.toUpperCase();
  if (["ACTIVE", "ENABLED", "ELIGIBLE"].includes(s)) return <span className="badge green"><span className="dot" />{titleCase(status)}</span>;
  if (["PAUSED", "CAMPAIGN_PAUSED", "ADSET_PAUSED", "ENDED"].includes(s)) return <span className="badge">{titleCase(status)}</span>;
  if (["LIMITED", "LEARNING", "IN_PROCESS", "PENDING"].includes(s)) return <span className="badge amber">{titleCase(status)}</span>;
  return <span className="badge red">{titleCase(status)}</span>;
}

function cell(m: Metrics, key: keyof Metrics, cur: string) {
  const v = m[key];
  if (v === null || v === undefined) return "–";
  if (key === "spend" || key === "cpc" || key === "costPerResult" || key === "cpm") return money(v as number, cur);
  if (key === "ctr") return pct(v as number);
  if (key === "frequency" || key === "roas") return (v as number).toFixed(2);
  return num(v as number, key === "results" ? 1 : 0);
}

export default function AccountCard({ a }: { a: AccountReport }) {
  const cur = a.currency;
  const showRoas = a.last7.value > 0;
  return (
    <div className="card account">
      <div className="account-head">
        <div>
          <div className="name">{a.name}</div>
          <div className="meta mono">
            {a.platform === "meta" ? `act_${a.id}` : a.id.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3")}
            {a.dates.yesterday && ` · ${a.currency} · last 7 days ${shortDate(a.dates.last7[0])} to ${shortDate(a.dates.last7[1])}`}
          </div>
        </div>
        {a.error ? <span className="badge red"><span className="dot" />Error</span> : statusBadge(a.status === "Active" ? "ACTIVE" : a.status)}
      </div>

      {!a.error && (
        <div className="kpis">
          <Kpi label="Spend · last 7 days" value={money(a.last7.spend, cur)} now={a.last7.spend} before={a.prev7.spend} neutral>
            <Sparkline points={a.series} field="spend" />
          </Kpi>
          <Kpi label={`${a.resultLabel} · last 7 days`} value={num(a.last7.results, 1)} now={a.last7.results} before={a.prev7.results}>
            <Sparkline points={a.series} field="results" />
          </Kpi>
          <Kpi label={`Cost per result`} value={a.last7.costPerResult === null ? "–" : money(a.last7.costPerResult, cur)} now={a.last7.costPerResult} before={a.prev7.costPerResult} lowerIsBetter />
          {showRoas ? (
            <Kpi label="ROAS" value={a.last7.roas === null ? "–" : `${a.last7.roas.toFixed(2)}x`} now={a.last7.roas} before={a.prev7.roas} />
          ) : (
            <Kpi label="CTR · last 7 days" value={pct(a.last7.ctr)} now={a.last7.ctr} before={a.prev7.ctr}>
              <div className="sub flat" style={{ marginTop: 10 }}>
                Yesterday: <span className="mono">{money(a.yesterday.spend, cur)}</span> spend, <span className="mono">{num(a.yesterday.results, 1)}</span> results
              </div>
            </Kpi>
          )}
        </div>
      )}

      {a.flags.length > 0 ? (
        <ul className="flags">
          {a.flags.map((f, i) => (
            <li key={i} className={f.level}>
              {f.level === "info" ? <InfoIcon /> : <AlertIcon />}
              <span>{f.text}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flags-ok"><CheckIcon /> No issues found</div>
      )}

      {!a.error && (
        <div className="table-wrap">
          {a.campaigns.length === 0 ? (
            <div className="empty">No live campaigns and no spend in the last 7 days.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Status</th>
                  <th>Daily budget</th>
                  <th>Spend yesterday</th>
                  <th>Spend 7d</th>
                  <th>Results 7d</th>
                  <th>Cost / result</th>
                  <th>CTR</th>
                  <th>CPC</th>
                  {a.platform === "meta" ? <th>Frequency</th> : <th>Conv. rate</th>}
                  {showRoas && <th>ROAS</th>}
                </tr>
              </thead>
              <tbody>
                {a.campaigns.map((c) => (
                  <tr key={c.id}>
                    <td className="camp">
                      <div className="cname">{c.name}</div>
                      <div className="ctype">{titleCase(c.type)} · {c.resultLabel}</div>
                      {c.notes.map((n, i) => <div key={i} className="cnote">{n}</div>)}
                    </td>
                    <td>{statusBadge(c.status)}</td>
                    <td className="mono">{c.dailyBudget ? money(c.dailyBudget, cur) : "–"}</td>
                    <td className="mono">{cell(c.yesterday, "spend", cur)}</td>
                    <td className="mono">{cell(c.last7, "spend", cur)}</td>
                    <td className="mono">{cell(c.last7, "results", cur)}</td>
                    <td className="mono">{cell(c.last7, "costPerResult", cur)}</td>
                    <td className="mono">{cell(c.last7, "ctr", cur)}</td>
                    <td className="mono">{cell(c.last7, "cpc", cur)}</td>
                    {a.platform === "meta" ? (
                      <td className="mono">{cell(c.last7, "frequency", cur)}</td>
                    ) : (
                      <td className="mono">{c.last7.clicks > 0 ? pct((c.last7.results / c.last7.clicks) * 100, 1) : "–"}</td>
                    )}
                    {showRoas && <td className="mono">{c.last7.roas ? `${c.last7.roas.toFixed(2)}x` : "–"}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
