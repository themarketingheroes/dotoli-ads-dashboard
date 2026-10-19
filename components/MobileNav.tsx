"use client";

import { useRouter } from "next/navigation";

export default function MobileNav({ clients, active, isOwner }: { clients: { slug: string; name: string }[]; active?: string; isOwner: boolean }) {
  const router = useRouter();
  const value = active === "__access" ? "/access" : active ? `/c/${active}` : "/";
  return (
    <div className="mobile-nav">
      <select className="input" value={value} onChange={(e) => router.push(e.target.value)} aria-label="Go to client">
        <option value="/">Overview</option>
        {clients.map((c) => (
          <option key={c.slug} value={`/c/${c.slug}`}>{c.name}</option>
        ))}
        {isOwner && <option value="/access">Access settings</option>}
      </select>
    </div>
  );
}
