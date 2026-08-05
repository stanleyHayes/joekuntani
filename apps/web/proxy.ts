import { NextRequest, NextResponse } from "next/server";

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/admin/login"))
    return NextResponse.next();
  const apiBase = process.env.API_BASE_URL;
  if (!apiBase) return redirectToLogin(request);
  try {
    const response = await fetch(`${apiBase}/api/admin/auth/me`, {
      headers: { cookie: request.headers.get("cookie") ?? "" },
      cache: "no-store",
    });
    if (response.ok) return NextResponse.next();
  } catch {
    /* Fail closed when authentication cannot be verified. */
  }
  return redirectToLogin(request);
}

function redirectToLogin(request: NextRequest) {
  const login = new URL("/admin/login", request.url);
  return NextResponse.redirect(login);
}

export const config = { matcher: ["/admin/:path*"] };
