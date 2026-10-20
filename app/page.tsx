import Link from "next/link";
import { redirect } from "next/navigation";
import DateControl from "@/components/DateControl";
import Delta from "@/components/Delta";
import { GoogleAdsLogo, MetaLogo } from "@/components/Icons";
import RefreshButton from "@/components/RefreshButton";
import Shell from "@/components/Shell";
import StatusBanner, { lastUpdated } from "@/components/StatusBanner";
import { currentViewer } from "@/lib/access";
import { money, num } from "@/lib/format";
import { rangeQuery, resolveRange } from "@/lib/range";
import { latestSnapshot } from "@/lib/refresh";
import type { AccountReport, DayPoint } from "@/lib/types";
import { accountView, AccountView } from "@/lib/view";

export const dynamic = "force-dynamic";

function Spark({ points }: { points: DayPoint[] }) {
  if (points.length < 2) return null;
  const W = 300;
  const H = 28;
  const max = Math.max(...points.map((p) => p.spend), 0.0001);
  const d = points.map((p, i) => `${i ? "L" : "M"}${((i / (points.length - 1)) * W).toFixed(1)},${(H - 2 - (p.spend / max) * (H - 4)).toFixed(1)}`).join(" ");
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={`${d} L${W},${H} L0,${H} Z`} fill="var(--chart-fill)" />
      <path d={d} fill="none" stroke="var(--chart)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

// One block per ad account. Accounts are never added together.
function AccountBlock({ v, icon }: { v: AccountView; icon: React.ReactNode }) {
  if (v.error) {
    return (
      <div className="pl">
        {icon}
        <span className="badge red" style={{ justifySelf: "start" }}>Not connected</span>
        <span />
      </div>
    );
  }
  return (
    <div className="pl">
      {icon}
      <span className="big">{money(v.cur.spend, v.currency)}</span>
      <Delta now={v.cur.spend} before={v.prev?.spend ?? null} good="neutral" />
      <div className="meta-line">
        <span><b>{num(v.cur.results, 1)}</b> {v.resultLabel.toLowerCase()} {v.prev && <Delta now={v.cur.results} before={v.prev.results} />}</span>
        <span>
          <b>{v.cur.costPerResult === null ? "–" : money(v.cur.costPerResult, v.currency)}</b> per result{" "}
          {v.prev && <Delta now={v.cur.costPerResult} before={v.prev.costPerResult} good="lower" />}
        </span>
      </div>
      <Spark points={v.series} />
    </div>
  );
}

function FlagChips({ accounts }: { accounts: AccountReport[] }) {
  const flags = accounts.flatMap((a) => a.flags);
  const crit = flags.filter((f) => f.level === "critical").length;
  const warn = flags.filter((f) => f.level === "warning").length;
  if (crit + warn === 0) return <div className="cc-flags"><span className="badge green">No live issues</span></div>;
  return (
    <div className="cc-flags">
      {crit > 0 && <span className="badge red">{crit} critical</span>}
      {warn > 0 && <span className="badge amber">{warn} warning{warn > 1 ? "s" : ""}</span>}
    </div>
  );
}

export default async function Overview({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const range = resolveRange(await searchParams);
  const viewer = await currentViewer();
  if (!viewer) redirect("/login");
  const snapshot = await latestSnapshot();
  const qs = rangeQuery(range);

  const cards = await Promise.all(
    viewer.clients.map(async (cfg) => {
      const report = snapshot?.clients.find((x) => x.slug === cfg.slug);
      const meta = report ? await Promise.all(report.meta.map((a) => accountView(a, range, false))) : [];
      const google = report ? await Promise.all(report.google.map((a) => accountView(a, range, false))) : [];
      // Used only to order the cards; never shown as a combined number.
      const sortKey = [...meta, ...google].reduce((s, v) => s + v.cur.spend, 0);
      return { cfg, report, meta, google, sortKey };
    }),
  );
  cards.sort((a, b) => b.sortKey - a.sortKey);

  return (
    <Shell viewer={viewer} snapshot={snapshot} qs={qs}>
      <div className="page-head">
        <div>
          <h1>Overview</h1>
          <p>
            <b style={{ color: "var(--fg)", fontWeight: 500 }}>{range.label}</b>
            {range.compareLabel ? `, compared with ${range.compareLabel}` : ""}. Clients ordered by spend.
          </p>
          <p>{lastUpdated(snapshot)}</p>
        </div>
        <div className="head-actions">
          <DateControl preset={range.preset} from={range.from} to={range.to} compare={range.compare} label={range.label} compareLabel={range.compareLabel} />
          <RefreshButton />
        </div>
      </div>
      <StatusBanner snapshot={snapshot} isOwner={viewer.isOwner || !!viewer.open} />
      {viewer.clients.length === 0 ? (
        <div className="card empty">No clients are assigned to your account yet.</div>
      ) : (
        <div className="grid">
          {cards.map(({ cfg, report, meta, google }, i) => (
            <Link key={cfg.slug} href={`/c/${cfg.slug}${qs}`} className="card client-card">
              <div className="cc-head">
                <h3>{cfg.name}</h3>
                <span className="cc-rank">#{i + 1}</span>
              </div>
              {!report ? (
                <div className="muted">Waiting for first refresh</div>
              ) : (
                <>
                  {meta.map((v) => <AccountBlock key={v.id} v={v} icon={<MetaLogo />} />)}
                  {google.map((v) => <AccountBlock key={v.id} v={v} icon={<GoogleAdsLogo />} />)}
                  {meta.length + google.length === 0 && <div className="muted">No ad accounts connected</div>}
                  <FlagChips accounts={[...report.meta, ...report.google]} />
                </>
              )}
            </Link>
          ))}
        </div>
      )}
    </Shell>
  );
}
