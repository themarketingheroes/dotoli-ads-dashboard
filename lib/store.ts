import { get, list, put, del } from "@vercel/blob";

// Private Vercel Blob storage. Every write is a new timestamped file and reads
// take the newest one from list(), which is never cached, so a refresh is
// visible immediately and the previous versions double as history.

const KEEP = 90;

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export async function writeJson(prefix: string, data: unknown, keep = KEEP): Promise<void> {
  await put(`${prefix}/${stamp()}.json`, JSON.stringify(data), {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
  });
  await prune(prefix, keep);
}

export async function readLatestJson<T>(prefix: string): Promise<T | null> {
  const blobs = await listAll(prefix);
  if (blobs.length === 0) return null;
  const latest = blobs.sort((a, b) => (a.pathname < b.pathname ? 1 : -1))[0];
  const res = await get(latest.pathname, { access: "private" });
  if (!res || res.statusCode !== 200) return null;
  const text = await new Response(res.stream).text();
  return JSON.parse(text) as T;
}

async function listAll(prefix: string) {
  const out: { pathname: string; url: string }[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: `${prefix}/`, cursor, limit: 1000 });
    out.push(...page.blobs.map((b) => ({ pathname: b.pathname, url: b.url })));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return out;
}

async function prune(prefix: string, keep: number) {
  const blobs = (await listAll(prefix)).sort((a, b) => (a.pathname < b.pathname ? 1 : -1));
  const old = blobs.slice(keep).map((b) => b.url);
  if (old.length) await del(old);
}
