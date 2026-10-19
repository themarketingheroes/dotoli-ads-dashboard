import { redirect } from "next/navigation";
import AccessManager from "@/components/AccessManager";
import Shell from "@/components/Shell";
import { currentViewer, getAccessList } from "@/lib/access";
import { ownerEmail } from "@/lib/config";
import { latestSnapshot } from "@/lib/refresh";

export const dynamic = "force-dynamic";

export default async function AccessPage() {
  const viewer = await currentViewer();
  if (!viewer) redirect("/login");
  if (!viewer.isOwner) redirect("/");
  const [list, snapshot] = await Promise.all([getAccessList(), latestSnapshot()]);

  return (
    <Shell viewer={viewer} snapshot={snapshot} active="__access" title="Access">
      <div className="page-head">
        <div>
          <h1>Access</h1>
          <p>People sign in with Google. Only emails listed here (and the owner, {ownerEmail()}) can get in, and each person sees only the clients you pick.</p>
        </div>
      </div>
      <AccessManager initial={list} clients={viewer.clients.map((c) => ({ slug: c.slug, name: c.name }))} />
    </Shell>
  );
}
