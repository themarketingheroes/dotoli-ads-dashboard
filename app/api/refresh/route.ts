import { NextRequest, NextResponse } from "next/server";
import { currentViewer } from "@/lib/access";
import { latestSnapshot, runRefresh } from "@/lib/refresh";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const MIN_GAP_MS = 2 * 60 * 1000;

// Vercel Cron calls GET with "Authorization: Bearer <CRON_SECRET>".
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const snap = await runRefresh("cron");
  return NextResponse.json({ ok: true, generatedAt: snap.generatedAt, durationMs: snap.durationMs });
}

// The Refresh button calls POST with the viewer's session.
export async function POST() {
  const viewer = await currentViewer();
  if (!viewer) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const last = await latestSnapshot();
  if (last && Date.now() - new Date(last.generatedAt).getTime() < MIN_GAP_MS) {
    return NextResponse.json({ ok: true, generatedAt: last.generatedAt, skipped: "Refreshed less than 2 minutes ago" });
  }
  const snap = await runRefresh("manual");
  return NextResponse.json({ ok: true, generatedAt: snap.generatedAt, durationMs: snap.durationMs });
}
