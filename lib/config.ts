import type { ClientConfig, GoogleAccountConfig } from "./types";

// The client roster lives in the DASHBOARD_CLIENTS env var (JSON), not in the
// repo, so client names and account IDs never land in public source control.
// Shape: [{ "slug": "abode-group", "name": "Abode Group", "meta": ["123"],
//           "google": ["456" | { "id": "456", "include": ["SIGNUP"], "label": "Sign-ups" }] }]
export function getClients(): ClientConfig[] {
  const raw = process.env.DASHBOARD_CLIENTS;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Array<{ slug: string; name: string; meta?: unknown[]; google?: unknown[] }>;
    return parsed.map((c) => ({
      slug: String(c.slug),
      name: String(c.name),
      meta: (c.meta ?? []).map((id) => String(id).replace(/^act_/, "")),
      google: (c.google ?? []).map((g): GoogleAccountConfig => {
        if (typeof g === "object" && g !== null) {
          const o = g as GoogleAccountConfig;
          return { ...o, id: String(o.id).replace(/\D/g, "") };
        }
        return { id: String(g).replace(/\D/g, "") };
      }),
    }));
  } catch {
    console.error("DASHBOARD_CLIENTS is not valid JSON");
    return [];
  }
}

export function googleRule(googleId: string): GoogleAccountConfig {
  for (const c of getClients()) for (const g of c.google) if (g.id === googleId) return g;
  return { id: googleId };
}

// Set DASHBOARD_AUTH=off to open the dashboard without sign-in.
export function authEnabled(): boolean {
  return (process.env.DASHBOARD_AUTH ?? "on").toLowerCase() !== "off";
}

export function ownerEmail(): string {
  return (process.env.OWNER_EMAIL ?? "").trim().toLowerCase();
}
