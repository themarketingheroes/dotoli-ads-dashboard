import { money, num, pct, titleCase } from "@/lib/format";
import type { Range } from "@/lib/range";
import type { Metrics } from "@/lib/types";
import type { AccountView } from "@/lib/view";
import CampaignTable from "./CampaignTable";
import Delta, { Goodness } from "./Delta";
import { GoogleAdsLogo, MetaLogo } from "./Icons";
import TrendChart from "./TrendChart";

function Kpi({ label, value, now, before, good, prevText, hero }: { label: string; value: string; now: number | null; before: number | null | undefined; good: Goodness; prevText: string | null; hero?: boolean }) {
  return (
    <div className={`card kpi${hero ? " hero" : ""}`}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {before !== undefined && (
        <div className="cmp">
          <Delta now={now} before={before} good={good} />
          {prevText && <span>vs {prevText}</span>}
        </div>
      )}
    </div>
  );
}

function kpis(a: AccountView) {
  const c = a.cur;
  const p = a.prev;
  const cur = a.currency;
  const m = (x: number | null) => (x === null ? "–" : money(x, cur));
  const prevOf = (f: (x: Metrics) => number | null, fmt: (x: number | null) => string) => (p ? fmt(f(p)) : null);
  const b = (f: (x: Metrics) => number | null) => (p ? f(p) : undefined);
  const tiles = [
    <Kpi key="spend" hero label="Spend" value={money(c.spend, cur)} now={c.spend} before={b((x) => x.spend)} good="neutral" prevText={prevOf((x) => x.spend, m)} />,
    <Kpi key="res" label={a.resultLabel} value={num(c.results, 1)} now={c.results} before={b((x) => x.results)} good="higher" prevText={prevOf((x) => x.results, (v) => num(v ?? 0, 1))} />,
    <Kpi key="cpr" label="Cost per result" value={m(c.costPerResult)} now={c.costPerResult} before={b((x) => x.costPerResult)} good="lower" prevText={prevOf((x) => x.costPerResult, m)} />,
  ];
  // ROAS only means something for sales accounts; lead-gen values are placeholders.
  if (a.resultLabel === "Purchases" && c.value > 0) {
    tiles.push(<Kpi key="roas" label="ROAS" value={c.roas === null ? "–" : `${c.roas.toFixed(2)}x`} now={c.roas} before={b((x) => x.roas)} good="higher" prevText={prevOf((x) => x.roas, (v) => (v === null ? "–" : `${v.toFixed(2)}x`))} />);
  } else {
    tiles.push(<Kpi key="clicks" label="Clicks" value={num(c.clicks)} now={c.clicks} before={b((x) => x.clicks)} good="higher" prevText={prevOf((x) => x.clicks, (v) => num(v ?? 0))} />);
  }
  tiles.push(<Kpi key="ctr" label="CTR" value={pct(c.ctr)} now={c.ctr} before={b((x) => x.ctr)} good="higher" prevText={prevOf((x) => x.ctr, (v) => pct(v))} />);
  return tiles;
}

function statusBadge(a: AccountView) {
  if (a.error) return <span className="badge red"><span className="dot" />Error</span>;
  if (a.status === "Active") return <span className="badge green"><span className="dot" />Active</span>;
  return <span className="badge red"><span className="dot" />{titleCase(a.status)}</span>;
}

export default function PlatformSection({ platform, accounts, range }: { platform: "meta" | "google"; accounts: AccountView[]; range: Range }) {
  const title = platform === "meta" ? "Meta Ads" : "Google Ads";
  return (
    <section className="platform">
      {accounts.length === 0 && (
        <div className="platform-head">
          {platform === "meta" ? <MetaLogo /> : <GoogleAdsLogo />}
          <h2>{title}</h2>
          <span className="acct">Not connected for this client</span>
        </div>
      )}
      {accounts.map((a) => (
        <div key={a.id} style={{ marginBottom: 28 }}>
          <div className="platform-head">
            {platform === "meta" ? <MetaLogo /> : <GoogleAdsLogo />}
            <h2>{title}</h2>
            <span className="acct mono">
              {a.name ? `${a.name} · ` : ""}
              {platform === "meta" ? `act_${a.id}` : a.id.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3")} · {a.currency}
            </span>
            <span className="grow" />
            {statusBadge(a)}
          </div>

          {a.error ? (
            <div className="card empty" style={{ color: "var(--bad)" }}>{a.error}</div>
          ) : (
            <>
              <div className="kpis">{kpis(a)}</div>
              <TrendChart series={a.series} cSeries={a.cSeries} currency={a.currency} resultLabel={a.resultLabel} compareLabel={range.compareLabel} />
              <div className="card table-card">
                <div className="table-head">
                  <h3>Campaigns</h3>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {range.label}
                    {range.compareLabel ? ` · changes vs ${range.compareLabel}` : ""}
                  </span>
                </div>
                <CampaignTable campaigns={a.campaigns} currency={a.currency} hasCompare={!!a.prev} />
              </div>
              {a.actions && a.actions.length > 0 && (
                <div className="card table-card convs">
                  <div className="table-head">
                    <h3>Which conversions are counted as {a.resultLabel.toLowerCase()}</h3>
                    <span className="muted" style={{ fontSize: 12 }}>Google conversion actions in this period</span>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr><th>Conversion action</th><th>Type</th><th>Conversions</th><th>Counted</th></tr>
                      </thead>
                      <tbody>
                        {a.actions.map((x) => (
                          <tr key={x.name}>
                            <td>{x.name}</td>
                            <td className="muted">{titleCase(x.category)}</td>
                            <td className="num">{num(x.conversions, 1)}</td>
                            <td>{x.counted ? <span className="badge green">Counted</span> : <span className="badge">Excluded</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      ))}
    </section>
  );
}
