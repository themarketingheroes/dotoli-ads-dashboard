import { NextRequest, NextResponse } from "next/server";
import { appOrigin } from "@/lib/origin";
import { SESSION_COOKIE } from "@/lib/session";

export async function POST(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/login", appOrigin(req)), { status: 303 });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
