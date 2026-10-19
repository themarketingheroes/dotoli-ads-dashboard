import type { NextRequest } from "next/server";

export function appOrigin(req: NextRequest): string {
  return (process.env.APP_URL ?? req.nextUrl.origin).replace(/\/$/, "");
}
