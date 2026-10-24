import { NextRequest, NextResponse } from "next/server";
import { ingestAccount, IngestAccount } from "@/lib/ingest";
import { runRefresh } from "@/lib/refresh";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Called by the Google Ads Script with "Authorization: Bearer <INGEST_SECRET>".
// Body: { accounts: IngestAccount[], refresh?: boolean }
export async function POST(req: NextRequest) {
  const secret = process.env.INGEST_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as { accounts?: IngestAccount[]; refresh?: boolean };
  const results = [];
  for (const a of body.accounts ?? []) {
    try {
      results.push({ ok: true, ...(await ingestAccount(a)) });
    } catch (e) {
      results.push({ ok: false, id: a?.account?.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  let refreshed: string | null = null;
  if (body.refresh) refreshed = (await runRefresh("cron")).generatedAt;
  return NextResponse.json({ ok: true, results, refreshed });
}
