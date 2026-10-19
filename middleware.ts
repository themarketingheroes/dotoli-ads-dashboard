import { NextRequest, NextResponse } from "next/server";
import { readSession, SESSION_COOKIE } from "./lib/session";

// Everything requires a signed-in session except the login flow and the
// refresh endpoint (which checks the cron secret or the session itself).
const PUBLIC = ["/login", "/api/auth/", "/api/refresh"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if ((process.env.DASHBOARD_AUTH ?? "on").toLowerCase() === "off") {
    if (pathname === "/login") return NextResponse.redirect(new URL("/", req.url));
    return NextResponse.next();
  }
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p))) return NextResponse.next();
  const session = await readSession(req.cookies.get(SESSION_COOKIE)?.value);
  if (session) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
