import { NextRequest, NextResponse } from "next/server";
import { currentViewer, getAccessList, saveAccessList } from "@/lib/access";
import { getClients, ownerEmail } from "@/lib/config";
import type { AccessEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

async function ownerOnly() {
  const v = await currentViewer();
  return v?.isOwner ? v : null;
}

export async function GET() {
  if (!(await ownerOnly())) return NextResponse.json({ error: "Owner only" }, { status: 403 });
  return NextResponse.json(await getAccessList());
}

export async function POST(req: NextRequest) {
  if (!(await ownerOnly())) return NextResponse.json({ error: "Owner only" }, { status: 403 });
  const body = (await req.json()) as { email?: string; clients?: "all" | string[] };
  const email = (body.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });
  if (email === ownerEmail()) return NextResponse.json({ error: "The owner always has full access" }, { status: 400 });
  const valid = new Set(getClients().map((c) => c.slug));
  const clients = body.clients === "all" ? "all" : (body.clients ?? []).filter((s) => valid.has(s));
  if (clients !== "all" && clients.length === 0) return NextResponse.json({ error: "Pick at least one client" }, { status: 400 });

  const list = (await getAccessList()).filter((a) => a.email !== email);
  const entry: AccessEntry = { email, clients, addedAt: new Date().toISOString() };
  await saveAccessList([...list, entry].sort((a, b) => a.email.localeCompare(b.email)));
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!(await ownerOnly())) return NextResponse.json({ error: "Owner only" }, { status: 403 });
  const { email } = (await req.json()) as { email?: string };
  const list = await getAccessList();
  await saveAccessList(list.filter((a) => a.email !== (email ?? "").toLowerCase()));
  return NextResponse.json({ ok: true });
}
