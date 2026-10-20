import { notFound, redirect } from "next/navigation";
import Alerts from "@/components/Alerts";
import DateControl from "@/components/DateControl";
import PlatformSection from "@/components/PlatformSection";
import RefreshButton from "@/components/RefreshButton";
import Shell from "@/components/Shell";
import StatusBanner, { lastUpdated } from "@/components/StatusBanner";
import { currentViewer } from "@/lib/access";
import { rangeQuery, resolveRange } from "@/lib/range";
import { latestSnapshot } from "@/lib/refresh";
import { accountView } from "@/lib/view";

export const dynamic = "force-dynamic";

export default async function ClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const range = resolveRange(await searchParams);
  const viewer = await currentViewer();
  if (!viewer) redirect("/login");
  const cfg = viewer.clients.find((c) => c.slug === slug);
  if (!cfg) notFound(); // not on this viewer's list, so it does not exist for them

  const snapshot = await latestSnapshot();
  const report = snapshot?.clients.find((c) => c.slug === slug);
  const [meta, google] = report
    ? await Promise.all([Promise.all(report.meta.map((a) => accountView(a, range))), Promise.all(report.google.map((a) => accountView(a, range)))])
    : [[], []];

  return (
    <Shell viewer={viewer} snapshot={snapshot} active={slug} title={cfg.name} qs={rangeQuery(range)}>
      <div className="page-head">
        <div>
          <h1>{cfg.name}</h1>
          <p>{lastUpdated(snapshot)}</p>
        </div>
        <div className="head-actions">
          <DateControl preset={range.preset} from={range.from} to={range.to} compare={range.compare} label={range.label} compareLabel={range.compareLabel} />
          <RefreshButton />
        </div>
      </div>
      <StatusBanner snapshot={snapshot} isOwner={viewer.isOwner || !!viewer.open} />

      {!report ? (
        <div className="card empty">No data yet. Click Refresh to pull this client&apos;s numbers.</div>
      ) : (
        <>
          <Alerts accounts={[...report.meta, ...report.google]} />
          <PlatformSection platform="meta" accounts={meta} range={range} />
          <PlatformSection platform="google" accounts={google} range={range} />
        </>
      )}
    </Shell>
  );
}
