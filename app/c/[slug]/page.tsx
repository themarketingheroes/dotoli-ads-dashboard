import { notFound, redirect } from "next/navigation";
import AccountCard from "@/components/AccountCard";
import { GoogleAdsLogo, MetaLogo } from "@/components/Icons";
import RefreshButton from "@/components/RefreshButton";
import Shell from "@/components/Shell";
import StatusBanner, { lastUpdated } from "@/components/StatusBanner";
import { currentViewer } from "@/lib/access";
import { latestSnapshot } from "@/lib/refresh";

export const dynamic = "force-dynamic";

export default async function ClientPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const viewer = await currentViewer();
  if (!viewer) redirect("/login");
  const cfg = viewer.clients.find((c) => c.slug === slug);
  if (!cfg) notFound(); // not on this viewer's list, so it does not exist for them

  const snapshot = await latestSnapshot();
  const report = snapshot?.clients.find((c) => c.slug === slug);

  return (
    <Shell viewer={viewer} snapshot={snapshot} active={slug} title={cfg.name}>
      <div className="page-head">
        <div>
          <h1>{cfg.name}</h1>
          <p>{lastUpdated(snapshot)}</p>
        </div>
        <RefreshButton />
      </div>
      <StatusBanner snapshot={snapshot} isOwner={viewer.isOwner} />

      {!report ? (
        <div className="card empty">No data yet. Click Refresh to pull this client's numbers.</div>
      ) : (
        <>
          <section className="platform">
            <div className="platform-head"><MetaLogo /><h2>Meta Ads</h2></div>
            {report.meta.length === 0 ? (
              <div className="card empty">No Meta ad account connected for this client.</div>
            ) : (
              report.meta.map((a) => <AccountCard key={a.id} a={a} />)
            )}
          </section>
          <section className="platform">
            <div className="platform-head"><GoogleAdsLogo /><h2>Google Ads</h2></div>
            {report.google.length === 0 ? (
              <div className="card empty">No Google Ads account connected for this client.</div>
            ) : (
              report.google.map((a) => <AccountCard key={a.id} a={a} />)
            )}
          </section>
        </>
      )}
    </Shell>
  );
}
