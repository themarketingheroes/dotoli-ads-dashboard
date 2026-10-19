import { NextRequest, NextResponse } from "next/server";
import { resolveViewer } from "@/lib/access";
import { appOrigin } from "@/lib/origin";
import { createSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";

function fail(req: NextRequest, code: string) {
  const res = NextResponse.redirect(new URL(`/login?error=${code}`, appOrigin(req)));
  res.cookies.delete("dad_state");
  return res;
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code || !state || state !== req.cookies.get("dad_state")?.value) return fail(req, "state");

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_AUTH_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_AUTH_CLIENT_SECRET ?? "",
      redirect_uri: `${appOrigin(req)}/api/auth/callback`,
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });
  const tokens = (await tokenRes.json()) as { id_token?: string };
  if (!tokens.id_token) return fail(req, "google");

  // The ID token came straight from Google's token endpoint over TLS, so its
  // claims can be read without re-verifying the signature.
  const claims = JSON.parse(Buffer.from(tokens.id_token.split(".")[1], "base64url").toString("utf8")) as {
    email?: string;
    email_verified?: boolean;
  };
  if (!claims.email || !claims.email_verified) return fail(req, "google");

  const viewer = await resolveViewer(claims.email);
  if (!viewer) return fail(req, "denied");

  const res = NextResponse.redirect(new URL("/", appOrigin(req)));
  res.cookies.set(SESSION_COOKIE, await createSession(viewer.email), sessionCookieOptions);
  res.cookies.delete("dad_state");
  return res;
}
