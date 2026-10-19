import Link from "next/link";
import { redirect } from "next/navigation";
import Shell from "@/components/Shell";
import RefreshButton from "@/components/RefreshButton";
import StatusBanner, { lastUpdated } from "@/components/StatusBanner";
import { MetaLogo, GoogleAdsLogo } from "@/components/Icons";
import { currentViewer } from "@/lib/access";
import { money, num } from "@/lib/format";
import { latestSnapshot } from "@/lib/refresh";
import type { AccountReport } from "@/lib/types";

export const dynamic = "force-dynamic";

// One line per ad account. Accounts are never added together, even within a client.
function AccountLine({ a, icon }: { a: AccountReport; icon: React.ReactNode }) {
  const crit = a.flags.filter((f) => f.level === "critical").length;
  const warn = a.flags.filter((f) => f.level === "warning").length;
  return (
    <div className="row" style={{ alignItems: "center" }}>
      <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {icon}
        {a.error ? <span className="badge red">Error</span> : <b className="mono">{money(a.last7.spend, a.currency)}</b>}
        {!a.error && <span className="flat mono">{num(a.last7.results, 1)} {a.resultLabel.toLowerCase()}</span>}
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
          <p>{lastUpdated(snapshot)} Spend and results are last 7 days, per ad account.</p>
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
