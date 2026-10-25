import { notFound, redirect } from "next/navigation";
import PrintButton from "@/components/PrintButton";
import Shell from "@/components/Shell";
import { currentViewer } from "@/lib/access";
import { fmtRange } from "@/lib/range";
import { latestSnapshot } from "@/lib/refresh";
import { buildReportView, loadConversionMix, loadReport, reportConfig, reportEnabled, ReportView } from "@/lib/report";

export const dynamic = "force-dynamic";

const money = (n: number | null, cur: string, d?: number) =>
  n === null ? "–" : new Intl.NumberFormat("en-US", { style: "currency", currency: cur || "USD", minimumFractionDigits: d ?? (Math.abs(n) >= 100 ? 0 : 2), maximumFractionDigits: d ?? (Math.abs(n) >= 100 ? 0 : 2) }).format(n);
const pct = (n: number | null, d = 0) => (n === null ? "–" : `${n.toFixed(d)}%`);
// Google reports impression share below 10% as 0.0999 and above 90% as 0.9001.
const share = (n: number | null) => (n === null ? "–" : Math.abs(n - 9.99) < 0.001 ? "<10%" : Math.abs(n - 90.01) < 0.001 ? ">90%" : `${n.toFixed(1)}%`);
const x2 = (n: number | null) => (n === null ? "–" : `${n.toFixed(2)}x`);
const nice = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="rsec">
      <h3><span className="rnum">{n}</span>{title}</h3>
      {children}
    </section>
  );
}

function AccountReport({ v }: { v: ReportView }) {
  const c = v.currency;
  return (
    <div className="card raccount">
      <div className="raccount-head">
        <div>
          <h2>{v.account}</h2>
          <p className="muted">
            Google Ads, month to date ({fmtRange(v.period.from, v.period.to)}). All figures in {c}. Total spend {money(v.totalCost, c)}.
            {" "}Data as of {new Date(v.generatedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })} ET.
          </p>
        </div>
      </div>

      <Section n="1a" title="Active campaigns">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Campaign</th><th style={{ textAlign: "left" }}>Type</th><th style={{ textAlign: "left" }}>Focus</th><th>Daily budget</th><th>Spend this month</th><th>Conversions</th><th>Conv. value</th><th>ROAS</th></tr></thead>
            <tbody>
              {v.campaigns.map((x) => (
                <tr key={x.id}>
                  <td className="camp"><div className="cname">{x.name}</div>{x.status && <div className="ctype">{x.status}</div>}</td>
                  <td style={{ textAlign: "left" }}>{x.type}</td>
                  <td style={{ textAlign: "left", whiteSpace: "normal", maxWidth: 320 }}>{x.focus}</td>
                  <td className="num">{money(x.budget, c)}</td>
                  <td className="num">{money(x.cost, c)}</td>
                  <td className="num">{x.conv.toFixed(0)}</td>
                  <td className="num">{money(x.value, c)}</td>
                  <td className="num">{x2(x.roas)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {v.conversions.counted && <p className="muted rsmall">{v.conversions.counted}</p>}
        {v.conversions.note && <p className="rnote flag">{v.conversions.note}</p>}
      </Section>

      <Section n="1b" title="Spend by product category">
        {v.categories.length === 0 ? (
          <p className="muted">{v.categoryEmpty}</p>
        ) : (
          <>
            {v.categoryNote && <p className={`rnote ${/^Flag|no product type in the feed/.test(v.categoryNote) ? "flag" : "ok"}`}>{v.categoryNote.trim()}</p>}
            <div className="table-wrap">
              <table>
                <thead><tr><th>Category</th><th>Spend</th><th>Share</th><th>Conversions</th><th>Conv. value</th><th>ROAS</th></tr></thead>
                <tbody>
                  {v.categories.map((k) => (
                    <tr key={k.name}>
                      <td className="camp">
                        <div className="cname">{k.name}{k.priority && <span className="badge green" style={{ marginLeft: 8 }}>Priority</span>}</div>
                        {k.children.length > 0 && <div className="ctype">{k.children.slice(0, 4).map((ch) => `${ch.name} ${money(ch.cost, c)}`).join(" · ")}</div>}
                      </td>
                      <td className="num">{money(k.cost, c)}<span className="share"><i style={{ width: `${(k.share * 100).toFixed(1)}%` }} /></span></td>
                      <td className="num">{pct(k.share * 100)}</td>
                      <td className="num">{k.conv.toFixed(0)}</td>
                      <td className="num">{money(k.value, c)}</td>
                      <td className="num">{x2(k.roas)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted rsmall">Product spend from Shopping and Performance Max: {money(v.productCost, c)} of {money(v.totalCost, c)} total.{v.productScope && ` ${v.productScope}`}</p>
          </>
        )}
      </Section>

      <Section n="1c" title="Brand vs non-brand">
        {!v.brand ? (
          <p className="muted">Brand terms are not configured yet.</p>
        ) : (
          <>
            <div className="rsplit">
              <div><div className="l">Brand</div><div className="v">{money(v.brand.brand, c)}</div><div className="muted">{pct(v.brand.brandShare * 100)} of spend</div></div>
              <div><div className="l">Non-brand</div><div className="v">{money(v.brand.nonBrand, c)}</div><div className="muted">{pct((1 - v.brand.brandShare) * 100)} of spend</div></div>
            </div>
            <div className="rbar"><i style={{ width: `${(v.brand.brandShare * 100).toFixed(1)}%` }} /></div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Campaign type</th><th>Brand</th><th>Non-brand</th></tr></thead>
                <tbody>{v.brand.byType.map((t) => <tr key={t.type}><td>{t.type}</td><td className="num">{money(t.brand, c)}</td><td className="num">{money(t.nonBrand, c)}</td></tr>)}</tbody>
              </table>
            </div>
            <p className="muted rsmall">
              Search and Shopping are split by the search terms people actually used ({pct(v.brand.termCoverage * 100)} of that spend has a visible search term).
              {v.brand.pmaxEstimated && " Performance Max does not report spend per search term, so its split is estimated from its search categories."}
            </p>
          </>
        )}
      </Section>

      <Section n="1d" title="Performance Max">
        {v.pmax.length === 0 ? (
          <p className="muted">No Performance Max campaigns this month.</p>
        ) : (
          v.pmax.map((p) => (
            <div key={p.campaign} className="rpmax">
              <h4>{p.campaign} <span className="muted">· {money(p.cost, c)} spend · {p.conv.toFixed(0)} conversion{Math.round(p.conv) === 1 ? "" : "s"} · {money(p.value, c)} conv. value</span></h4>
              {p.overlap && <p className="rnote flag">{p.overlap}</p>}
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Asset group</th><th style={{ textAlign: "left" }}>Products covered</th><th>Ad strength</th><th>Spend</th><th>Conversions</th><th>ROAS</th></tr></thead>
                  <tbody>
                    {p.assetGroups.map((a) => (
                      <tr key={a.name}>
                        <td className="camp"><div className="cname">{a.name}</div><div className="ctype">{nice(a.status)}</div></td>
                        <td style={{ textAlign: "left", whiteSpace: "normal", maxWidth: 420 }}>{a.products.map((l) => <div key={l}>{l}</div>)}</td>
                        <td>{a.strength ? nice(a.strength) : "–"}</td>
                        <td className="num">{money(a.cost, c)}</td>
                        <td className="num">{a.conv.toFixed(0)}</td>
                        <td className="num">{x2(a.cost > 0 && a.value > 0 ? a.value / a.cost : null)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {p.topCategories.length > 0 && (
                <p className="rsmall">Top search themes: {p.topCategories.map((t) => `${t.label} (${t.clicks} click${t.clicks === 1 ? "" : "s"})`).join(", ")}.</p>
              )}
            </div>
          ))
        )}
      </Section>

      <Section n="1e" title="Opportunities for extra budget">
        {v.opportunityNote && <p className="rnote flag">{v.opportunityNote}</p>}
        {v.opportunities.length === 0 ? (
          !v.opportunityNote && <p className="muted">No converting campaign is clearly held back by budget this month.</p>
        ) : (
          <ol className="ropps">
            {v.opportunities.map((o, i) => (
              <li key={i}>
                <b>{o.title}</b>: about +{money(o.extraPerDay, c)}/day (roughly +{money(o.extraPerMonth, c)}/month).
                <div className="muted">{o.detail}</div>
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section n="2" title="Remarketing: standalone campaign or inside Performance Max?">
        <p className="rnote">{v.remarketing.verdict}</p>
        {v.remarketing.lists.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Audience list</th><th style={{ textAlign: "left" }}>Type</th><th>Size (Search)</th><th>Size (Display / YouTube)</th><th>Days kept</th></tr></thead>
              <tbody>{v.remarketing.lists.map((l) => <tr key={l.name}><td>{l.name}</td><td style={{ textAlign: "left" }}>{nice(l.type)}</td><td className="num">{l.sizeSearch.toLocaleString("en-US")}</td><td className="num">{l.sizeDisplay.toLocaleString("en-US")}</td><td className="num">{l.lifeSpan || "–"}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </Section>

      <Section n="3" title="Competitor campaigns (all time)">
        <p className="rnote">{v.competitor.verdict}</p>
        {v.competitor.campaigns.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Competitor campaign</th><th>Spend</th><th>Clicks</th><th>Avg CPC</th><th>Conversions</th><th>ROAS</th></tr></thead>
              <tbody>{v.competitor.campaigns.map((k) => <tr key={k.id}><td className="camp"><div className="cname">{k.name}</div><div className="ctype">{k.status === "ENABLED" ? "Running now" : nice(k.status)}</div></td><td className="num">{money(k.cost, c)}</td><td className="num">{k.clicks.toLocaleString("en-US")}</td><td className="num">{money(k.clicks > 0 ? k.cost / k.clicks : null, c, 2)}</td><td className="num">{k.conv.toFixed(0)}</td><td className="num">{x2(k.cost > 0 && k.value > 0 ? k.value / k.cost : null)}</td></tr>)}</tbody>
            </table>
          </div>
        )}
        {v.competitor.keywords.length > 0 && (
          <div className="table-wrap" style={{ marginTop: 10 }}>
            <table>
              <thead><tr><th>Competitor keyword</th><th>Clicks</th><th>Spend</th><th>CPC paid</th><th>Conversions</th></tr></thead>
              <tbody>{v.competitor.keywords.map((k) => <tr key={k.text}><td>{k.text}</td><td className="num">{k.clicks}</td><td className="num">{money(k.cost, c)}</td><td className="num">{money(k.avgCpc, c, 2)}</td><td className="num">{k.conv.toFixed(0)}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </Section>

      <Section n="4" title="Impression share (Search and Shopping)">
        {v.impressionShare.length === 0 ? (
          <p className="muted">No Search or Shopping campaigns this month.</p>
        ) : (
          <>
            <p className="rsmall muted">Share of the impressions we were eligible for. Anything under 10% is flagged; "lost to budget" shows where more budget would buy more visibility, "lost to rank" where bids or quality hold us back.</p>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Campaign</th><th style={{ textAlign: "left" }}>Type</th><th>Impression share</th><th>Top of page</th><th>Absolute top</th><th>Lost to budget</th><th>Lost to rank</th><th>Spend</th></tr></thead>
                <tbody>
                  {v.impressionShare.map((x) => (
                    <tr key={x.name}>
                      <td className="camp"><div className="cname">{x.name}</div></td>
                      <td style={{ textAlign: "left" }}>{x.type}</td>
                      <td className="num">{x.low ? <span className="badge red">{share(x.is)}</span> : share(x.is)}</td>
                      <td className="num">{share(x.topIs)}</td>
                      <td className="num">{share(x.absTop)}</td>
                      <td className="num">{share(x.lostBudget)}</td>
                      <td className="num">{share(x.lostRank)}</td>
                      <td className="num">{money(x.cost, c)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Section>
    </div>
  );
}

export default async function ReportPage() {
  if (!reportEnabled()) notFound();
  const viewer = await currentViewer();
  if (!viewer) redirect("/login");
  const snapshot = await latestSnapshot();
  const cfg = reportConfig();

  const markets = await Promise.all(
    viewer.clients.map(async (client) => {
      const accounts = snapshot?.clients.find((c) => c.slug === client.slug)?.google ?? [];
      const views: ReportView[] = [];
      const waiting: string[] = [];
      for (const a of accounts) {
        const raw = a.error ? null : await loadReport(a.id);
        if (raw) views.push(buildReportView(raw, cfg, await loadConversionMix(a.id, raw.period.from, raw.period.to)));
        else waiting.push(a.name || a.id);
      }
      views.sort((a, b) => b.totalCost - a.totalCost);
      return { client, views, waiting };
    }),
  );

  return (
    <Shell viewer={viewer} snapshot={snapshot} active="__report" title="Google Ads report">
      <div className="page-head">
        <div>
          <h1>Google Ads breakdown</h1>
          <p>Month to date, one section per market. Updated daily from the Google Ads accounts.</p>
        </div>
        <div className="head-actions no-print"><PrintButton /></div>
      </div>
      {markets.map(({ client, views, waiting }) => (
        <section key={client.slug} className="rmarket">
          <h2 className="rmarket-title">{client.name}</h2>
          {views.length === 0 && <div className="card empty">Waiting for the Google Ads Script to send this market&apos;s data{waiting.length ? ` (${waiting.join(", ")})` : ""}.</div>}
          {views.map((v) => <AccountReport key={v.account} v={v} />)}
        </section>
      ))}
    </Shell>
  );
}
