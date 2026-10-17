import { convexAuthNextjsMiddleware } from "@convex-dev/auth/nextjs/server"
import { NextResponse } from "next/server"

export default convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
  const pathname = request.nextUrl.pathname

  // Convex Auth handles its sign-in endpoint before this route check.
  if (pathname.startsWith("/api/")) return NextResponse.next()

  const isAuthenticated = await convexAuth.isAuthenticated()
  const isAuthRoute = pathname === "/auth" || pathname.startsWith("/auth/")
  const isDashboardRoute =
    pathname === "/dashboard" || pathname.startsWith("/dashboard/")

  if (isAuthenticated) {
    return isDashboardRoute
      ? NextResponse.next()
      : NextResponse.redirect(new URL("/dashboard", request.url))
  }

  return isAuthRoute
    ? NextResponse.next()
    : NextResponse.redirect(new URL("/auth/sign-in", request.url))
})

export const config = {
  matcher: [
    "/api/auth",
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
}
