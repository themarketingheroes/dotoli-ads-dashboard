"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RefreshIcon } from "./Icons";

export default function RefreshButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function refresh() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/refresh", { method: "POST" });
      const body = await res.json();
      if (!res.ok) setMsg(body.error ?? "Refresh failed");
      else if (body.skipped) setMsg("Already up to date");
      router.refresh();
    } catch {
      setMsg("Refresh failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {msg && <span style={{ color: "var(--muted)", fontSize: 13 }}>{msg}</span>}
      <button className="btn primary" onClick={refresh} disabled={busy}>
        <RefreshIcon spinning={busy} />
        {busy ? "Refreshing…" : "Refresh"}
      </button>
    </div>
  );
}
