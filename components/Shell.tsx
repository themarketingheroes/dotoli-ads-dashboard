import Link from "next/link";
import type { Viewer } from "@/lib/access";
import type { Snapshot } from "@/lib/types";
import { Logo } from "./Icons";
import MobileNav from "./MobileNav";
import ScrollSpy from "./ScrollSpy";
import TogasLogo from "./TogasLogo";
import { theme } from "@/lib/config";
import { reportEnabled } from "@/lib/report";

function health(snapshot: Snapshot | null, slug: string): "critical" | "warning" | "ok" | null {
  const c = snapshot?.clients.find((x) => x.slug === slug);
  if (!c) return null;
  const flags = [...c.meta, ...c.google].flatMap((a) => a.flags);
  if (flags.some((f) => f.level === "critical")) return "critical";
  if (flags.some((f) => f.level === "warning")) return "warning";
  return "ok";
}

export default function Shell({
  viewer,
  snapshot,
  active,
  title,
  qs = "",
  subnav,
  children,
}: {
  viewer: Viewer;
  snapshot: Snapshot | null;
  active?: string;
  title?: string;
  qs?: string; // keeps the selected date range when moving between pages
  subnav?: { id: string; label: string }[]; // jump links shown under the active page
  children: React.ReactNode;
}) {
  return (
    <>
      <header className="topbar no-print">
        <Link href={`/${qs}`} className="brand">
          {theme() === "togas" ? (
            <>
              <TogasLogo height={20} />
              <span className="brand-sub">Ads Performance</span>
            </>
          ) : (
            <>
              <Logo />
              <span>Ads Dashboard</span>
            </>
          )}
        </Link>
        {title && (
          <>
            <span className="crumb-sep">/</span>
            <span className="crumb">{title}</span>
          </>
        )}
        <span className="spacer" />
        {!viewer.open && (
          <>
            <span className="user">{viewer.email}</span>
            <form action="/api/auth/logout" method="post">
              <button className="btn small" type="submit">Sign out</button>
            </form>
          </>
        )}
      </header>
      <div className="layout">
        <nav className="sidebar no-print" aria-label="Clients">
          <Link href={`/${qs}`} className={`navlink${!active ? " active" : ""}`}>Overview</Link>
          <h6>Clients</h6>
          {viewer.clients.map((c) => {
            const h = health(snapshot, c.slug);
            return (
              <Link key={c.slug} href={`/c/${c.slug}${qs}`} className={`navlink${active === c.slug ? " active" : ""}`}>
                <span>{c.name}</span>
                {h && <span className={`navdot ${h}`} title={h === "ok" ? "No issues" : `${h} flags`} />}
              </Link>
            );
          })}
          {reportEnabled() && (
            <>
              <h6>Reports</h6>
              <Link href="/report" className={`navlink${active === "__report" ? " active" : ""}`}>Google Ads report</Link>
              {active === "__report" && subnav?.length ? <ScrollSpy items={subnav} variant="side" /> : null}
            </>
          )}
          {viewer.isOwner && (
            <>
              <h6>Settings</h6>
              <Link href="/access" className={`navlink${active === "__access" ? " active" : ""}`}>Access</Link>
            </>
          )}
        </nav>
        <main className="main">
          <MobileNav qs={qs} clients={viewer.clients.map((c) => ({ slug: c.slug, name: c.name }))} active={active} isOwner={viewer.isOwner} />
          {children}
        </main>
      </div>
    </>
  );
}
