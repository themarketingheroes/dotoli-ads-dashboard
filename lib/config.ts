import type { ClientConfig, ConversionRule, GoogleAccountConfig } from "./types";

// The client roster lives in the DASHBOARD_CLIENTS env var (JSON), not in the
// repo, so client names and account IDs never land in public source control.
// Shape: [{ "slug": "abode-group", "name": "Abode Group", "meta": ["123"],
//           "google": ["456" | { "id": "456", "include": ["SIGNUP"], "label": "Sign-ups" }] }]
export function getClients(): ClientConfig[] {
  const raw = process.env.DASHBOARD_CLIENTS;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Array<{ slug: string; name: string; meta?: unknown[]; google?: unknown[]; ecommerce?: boolean }>;
    return parsed.map((c) => ({
      slug: String(c.slug),
      name: String(c.name),
      ecommerce: !!c.ecommerce,
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
  for (const c of getClients()) for (const g of c.google) if (g.id === googleId) return { ...g, ecommerce: g.ecommerce ?? c.ecommerce };
  return { id: googleId };
}

// Counting rule for any ad account (Google include/exclude, plus the client's e-commerce flag).
export function accountRule(platform: "meta" | "google", id: string): ConversionRule {
  if (platform === "google") return googleRule(id);
  const client = getClients().find((c) => c.meta.includes(id));
  return client?.ecommerce ? { ecommerce: true } : {};
}

// "tabs": overview shows one tab per client with each ad account as its own card.
export function overviewLayout(): "cards" | "tabs" {
  return process.env.DASHBOARD_LAYOUT === "tabs" ? "tabs" : "cards";
}

// Set DASHBOARD_AUTH=off to open the dashboard without sign-in.
export function authEnabled(): boolean {
  return (process.env.DASHBOARD_AUTH ?? "on").toLowerCase() !== "off";
}

export function ownerEmail(): string {
  return (process.env.OWNER_EMAIL ?? "").trim().toLowerCase();
}
