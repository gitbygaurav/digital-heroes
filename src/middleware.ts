import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const CUSTOMER_PREFIXES = [
  "/dashboard",
  "/orders",
  "/designs",
  "/proofs",
  "/account",
  "/cart",
  "/checkout",
  "/designer",
];

const ADMIN_PREFIX = "/admin";
const AUTH_ROUTES = ["/login", "/register", "/forgot-password"];

/**
 * Refreshes Supabase auth session cookies and enforces role-based route guards.
 * - Unauthenticated users accessing /admin or customer routes -> /login
 * - Non-admin users accessing /admin -> /dashboard (403-equivalent redirect)
 * - Authenticated users visiting /login or /register -> role home
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  const isAdminRoute =
    pathname === ADMIN_PREFIX || pathname.startsWith(`${ADMIN_PREFIX}/`);
  const isCustomerRoute = CUSTOMER_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  const isAuthRoute = AUTH_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );

  // Block unauthenticated access to protected routes
  if (!user && (isAdminRoute || isCustomerRoute)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Enforce role separation when user is authenticated
  if (user && (isAdminRoute || isAuthRoute)) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const role = profile?.role ?? "customer";

    // Customers must never access /admin
    if (isAdminRoute && role !== "admin") {
      const dashUrl = request.nextUrl.clone();
      dashUrl.pathname = "/dashboard";
      return NextResponse.redirect(dashUrl);
    }

    // Signed-in users visiting auth pages go straight to their console
    // (only if profile exists, preventing a /dashboard <-> /login redirect loop)
    if (isAuthRoute && profile) {
      const homeUrl = request.nextUrl.clone();
      homeUrl.pathname = role === "admin" ? "/admin" : "/dashboard";
      return NextResponse.redirect(homeUrl);
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
