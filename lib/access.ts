import { cookies } from "next/headers";
import { getClients, ownerEmail } from "./config";
import { readSession, SESSION_COOKIE } from "./session";
import { readLatestJson, writeJson } from "./store";
import type { AccessEntry, ClientConfig } from "./types";

const PREFIX = "access";

export async function getAccessList(): Promise<AccessEntry[]> {
  return (await readLatestJson<AccessEntry[]>(PREFIX)) ?? [];
}

export async function saveAccessList(entries: AccessEntry[]): Promise<void> {
  await writeJson(PREFIX, entries);
}

export interface Viewer {
  email: string;
  isOwner: boolean;
  clients: ClientConfig[]; // clients this viewer may see
}

export async function resolveViewer(email: string): Promise<Viewer | null> {
  const e = email.toLowerCase();
  const all = getClients();
  if (e && e === ownerEmail()) return { email: e, isOwner: true, clients: all };
  const entry = (await getAccessList()).find((a) => a.email === e);
  if (!entry) return null;
  const clients = entry.clients === "all" ? all : all.filter((c) => (entry.clients as string[]).includes(c.slug));
  return { email: e, isOwner: false, clients };
}

export async function currentViewer(): Promise<Viewer | null> {
  const session = await readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return null;
  return resolveViewer(session.email);
}
