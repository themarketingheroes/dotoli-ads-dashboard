import { NextRequest, NextResponse } from "next/server";
import { appOrigin } from "@/lib/origin";

export async function GET(req: NextRequest) {
  const clientId = process.env.GOOGLE_AUTH_CLIENT_ID;
  if (!clientId) return NextResponse.redirect(new URL("/login?error=config", req.url));
  const state = crypto.randomUUID();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${appOrigin(req)}/api/auth/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  const res = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  res.cookies.set("dad_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600 });
  return res;
}
