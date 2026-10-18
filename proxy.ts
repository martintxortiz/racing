import { convexAuthNextjsMiddleware } from "@convex-dev/auth/nextjs/server";
import { NextResponse } from "next/server";

export default convexAuthNextjsMiddleware(
  async (request, { convexAuth }) => {
    const pathname = request.nextUrl.pathname;
    const authenticated = await convexAuth.isAuthenticated();
    const allowed = authenticated
      ? pathname === "/auth/sign-out" ||
        pathname === "/dashboard" ||
        pathname.startsWith("/dashboard/")
      : pathname === "/auth" || pathname.startsWith("/auth/");

    return allowed
      ? NextResponse.next()
      : NextResponse.redirect(
          new URL(authenticated ? "/dashboard" : "/auth/sign-in", request.url),
        );
  },
  // Persistent cookies so sessions survive browser restarts (default is a session cookie).
  { cookieConfig: { maxAge: 60 * 60 * 24 * 30 } },
);

export const config = {
  matcher: [
    "/api/auth",
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
