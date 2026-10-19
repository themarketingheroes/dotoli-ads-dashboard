"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AccessEntry } from "@/lib/types";

export default function AccessManager({ initial, clients }: { initial: AccessEntry[]; clients: { slug: string; name: string }[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [all, setAll] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const names = new Map(clients.map((c) => [c.slug, c.name]));

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, clients: all ? "all" : picked }),
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) return setError(body.error ?? "Could not save");
    setEmail("");
    setPicked([]);
    setAll(false);
    router.refresh();
  }

  async function remove(target: string) {
    if (!confirm(`Remove access for ${target}?`)) return;
    await fetch("/api/access", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: target }) });
    router.refresh();
  }

  function toggle(slug: string) {
    setPicked((p) => (p.includes(slug) ? p.filter((s) => s !== slug) : [...p, slug]));
  }

  return (
    <>
      <form className="card" onSubmit={add} style={{ padding: 20, display: "grid", gap: 16, marginBottom: 24 }}>
        <div className="field">
          <label htmlFor="email">Google email</label>
          <input id="email" className="input" type="email" placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label>Can see</label>
          <div className="checks">
            <label className="check"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> All clients</label>
            {!all && clients.map((c) => (
              <label key={c.slug} className="check"><input type="checkbox" checked={picked.includes(c.slug)} onChange={() => toggle(c.slug)} /> {c.name}</label>
            ))}
          </div>
        </div>
        {error && <div className="error-text">{error}</div>}
        <div><button className="btn primary" disabled={busy}>{busy ? "Saving…" : "Give access"}</button></div>
      </form>

      <div className="card">
        <div className="table-wrap" style={{ borderTop: "none" }}>
          {initial.length === 0 ? (
            <div className="empty">Nobody else has access yet.</div>
          ) : (
            <table>
              <thead><tr><th>Email</th><th style={{ textAlign: "left" }}>Can see</th><th>Added</th><th /></tr></thead>
              <tbody>
                {initial.map((a) => (
                  <tr key={a.email}>
                    <td>{a.email}</td>
                    <td style={{ textAlign: "left", whiteSpace: "normal" }}>{a.clients === "all" ? "All clients" : a.clients.map((s) => names.get(s) ?? s).join(", ")}</td>
                    <td className="mono">{new Date(a.addedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
                    <td><button className="btn small" onClick={() => remove(a.email)}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
