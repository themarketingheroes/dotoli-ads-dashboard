import type { ClientConfig } from "./types";

// The client roster lives in the DASHBOARD_CLIENTS env var (JSON), not in the
// repo, so client names and account IDs never land in public source control.
// Shape: [{ "slug": "abode-group", "name": "Abode Group", "meta": ["123"], "google": ["456"] }]
export function getClients(): ClientConfig[] {
  const raw = process.env.DASHBOARD_CLIENTS;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ClientConfig[];
    return parsed.map((c) => ({
      slug: String(c.slug),
      name: String(c.name),
      meta: (c.meta ?? []).map((id) => String(id).replace(/^act_/, "")),
      google: (c.google ?? []).map((id) => String(id).replace(/\D/g, "")),
    }));
  } catch {
    console.error("DASHBOARD_CLIENTS is not valid JSON");
    return [];
  }
}

export function ownerEmail(): string {
  return (process.env.OWNER_EMAIL ?? "").trim().toLowerCase();
}
