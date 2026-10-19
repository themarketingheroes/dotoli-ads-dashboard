import { relativeTime } from "@/lib/format";
import type { Snapshot } from "@/lib/types";
import { AlertIcon } from "./Icons";

export function lastUpdated(snapshot: Snapshot | null): string {
  if (!snapshot) return "Not refreshed yet";
  const at = new Date(snapshot.generatedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
  return `Updated ${relativeTime(snapshot.generatedAt)} (${at} ET, ${snapshot.trigger === "cron" ? "daily run" : "manual refresh"}). Auto-refresh daily at 10:00 AM EST.`;
}

export default function StatusBanner({ snapshot, isOwner }: { snapshot: Snapshot | null; isOwner: boolean }) {
  if (!snapshot || !isOwner) return null;
  const t = snapshot.metaToken;
  if (t.error) {
    return <div className="banner red"><AlertIcon /><span>Meta connection problem: {t.error}. Generate a new token and update META_ACCESS_TOKEN in Vercel.</span></div>;
  }
  if (t.expiresAt) {
    const days = Math.floor((new Date(t.expiresAt).getTime() - Date.now()) / 86400000);
    if (days <= 7) {
      return <div className="banner amber"><AlertIcon /><span>The Meta access token expires in {Math.max(days, 0)} day{days === 1 ? "" : "s"}. Extend it in Meta's Access Token Debugger and update META_ACCESS_TOKEN in Vercel.</span></div>;
    }
  }
  return null;
}
