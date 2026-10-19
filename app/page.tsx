import Link from "next/link";
import { redirect } from "next/navigation";
import Shell from "@/components/Shell";
import RefreshButton from "@/components/RefreshButton";
import StatusBanner, { lastUpdated } from "@/components/StatusBanner";
import { MetaLogo, GoogleAdsLogo } from "@/components/Icons";
import { currentViewer } from "@/lib/access";
import { money, num, shortDate } from "@/lib/format";
import { latestSnapshot } from "@/lib/refresh";
import type { AccountReport, Snapshot } from "@/lib/types";

// "month to date (Oct 1 to Oct 19)", taken from the first account that has the range.
function monthLabel(snapshot: Snapshot | null): string {
  const range = snapshot?.clients.flatMap((c) => [...c.meta, ...c.google]).find((a) => a.dates.mtd)?.dates.mtd;
  return range ? `month to date (${shortDate(range[0])} to ${shortDate(range[1])})` : "month to date";
}

export const dynamic = "force-dynamic";

// One line per ad account. Accounts are never added together, even within a client.
function AccountLine({ a, icon }: { a: AccountReport; icon: React.ReactNode }) {
  const crit = a.flags.filter((f) => f.level === "critical").length;
  const warn = a.flags.filter((f) => f.level === "warning").length;
  const m = a.mtd;
  return (
    <div className="row" style={{ alignItems: "center", gap: 12 }}>
      <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {icon}
        {a.error ? (
          <span className="badge red">Error</span>
        ) : !m ? (
          <span className="flat">Refresh to load month to date</span>
        ) : (
          <>
            <b className="mono">{money(m.spend, a.currency)}</b>
            <span className="flat mono">
              {num(m.results, 1)} {a.resultLabel.toLowerCase()}
              {m.costPerResult !== null && ` · ${money(m.costPerResult, a.currency)} each`}
            </span>
          </>
        )}
      </span>
      <span>
        {crit > 0 && <span className="badge red">{crit} critical</span>}{" "}
        {warn > 0 && <span className="badge amber">{warn} warning{warn > 1 ? "s" : ""}</span>}
        {crit + warn === 0 && !a.error && <span className="badge green">OK</span>}
      </span>
    </div>
  );
}

export default async function Overview() {
  const viewer = await currentViewer();
  if (!viewer) redirect("/login");
  const snapshot = await latestSnapshot();
  const visible = new Set(viewer.clients.map((c) => c.slug));

  return (
    <Shell viewer={viewer} snapshot={snapshot}>
      <div className="page-head">
        <div>
          <h1>Overview</h1>
          <p>{lastUpdated(snapshot)}</p>
          <p>Spend and results are <b style={{ color: "var(--fg)", fontWeight: 500 }}>{monthLabel(snapshot)}</b>, per ad account.</p>
        </div>
        <RefreshButton />
      </div>
      <StatusBanner snapshot={snapshot} isOwner={viewer.isOwner} />
      {viewer.clients.length === 0 ? (
        <div className="card empty">No clients are assigned to your account yet.</div>
      ) : (
        <div className="grid">
          {viewer.clients.map((cfg) => {
            const c = snapshot?.clients.find((x) => x.slug === cfg.slug && visible.has(x.slug));
            return (
              <Link key={cfg.slug} href={`/c/${cfg.slug}`} className="card client-card">
                <h3>{cfg.name}</h3>
                {!c ? (
                  <div className="row">Waiting for first refresh</div>
                ) : (
                  <>
                    {c.meta.map((a) => <AccountLine key={a.id} a={a} icon={<MetaLogo />} />)}
                    {c.google.map((a) => <AccountLine key={a.id} a={a} icon={<GoogleAdsLogo />} />)}
                    {c.meta.length + c.google.length === 0 && <div className="row">No ad accounts connected</div>}
                  </>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </Shell>
  );
}
