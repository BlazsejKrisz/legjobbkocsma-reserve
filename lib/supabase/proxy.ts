import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasEnvVars } from "../utils";
import { checkEdgeRateLimit } from "../api/edgeRateLimiter";

// ─── Proxy-tier rate limiter ─────────────────────────────────────────────────
//
// The previous implementation used an in-memory Map keyed on IP+path.  On
// Vercel Fluid Compute that map is per-function-instance, so a hot
// attacker hitting fresh cold starts could effectively get N×limit
// requests/min.  We now back into Upstash via `checkEdgeRateLimit` so
// the counter is shared across instances.

function clientIp(request: NextRequest): string {
  // Vercel sets `x-vercel-forwarded-for` containing the verified client
  // IP.  Fall back to `x-forwarded-for` for non-Vercel runtimes; both
  // can be spoofed only when the request never reaches a trusted proxy
  // (i.e. local dev) — in those environments rate limit fidelity is
  // best-effort.
  const vercel = request.headers.get('x-vercel-forwarded-for')
  if (vercel) return vercel.split(',')[0]?.trim() ?? 'unknown'
  const xff = request.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0]?.trim() ?? 'unknown'
  return request.headers.get('x-real-ip') ?? 'unknown'
}

export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Apply edge rate limiting to public + partner endpoints.  Cron and
  // webhook handlers are not rate-limited here — they have their own
  // shared-secret gates and are typically called by trusted infra.
  if (pathname.startsWith('/api/public/') || pathname.startsWith('/api/partner')) {
    const ip = clientIp(request)
    const result = await checkEdgeRateLimit(ip, pathname)
    if (!result.ok) {
      return new NextResponse(JSON.stringify({ error: 'Too many requests' }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(result.retryAfter),
          // Permissive CORS on 429 so the browser can read the body —
          // we don't set `Access-Control-Allow-Credentials`, so this is
          // safe by spec.
          'Access-Control-Allow-Origin': '*',
        },
      })
    }
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  if (!hasEnvVars) {
    return supabaseResponse;
  }

  // With Fluid compute, don't put this client in a global environment
  // variable. Always create a new one on each request.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Skip the Supabase session refresh for cron/webhook/public/partner
  // paths — they're not authenticated by cookie, and skipping saves an
  // unnecessary getClaims() round-trip on every public request.
  const isUnauth =
    request.nextUrl.pathname.startsWith('/api/public') ||
    request.nextUrl.pathname.startsWith('/api/partner') ||
    request.nextUrl.pathname.startsWith('/api/cron') ||
    request.nextUrl.pathname.startsWith('/api/webhooks')

  if (isUnauth) {
    return supabaseResponse
  }

  // Do not run code between createServerClient and
  // supabase.auth.getClaims(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  // IMPORTANT: If you remove getClaims() and you use server-side rendering
  // with the Supabase client, your users may be randomly logged out.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  if (
    request.nextUrl.pathname !== "/" &&
    !user &&
    !request.nextUrl.pathname.startsWith("/login") &&
    !request.nextUrl.pathname.startsWith("/auth")
  ) {
    // no user, potentially respond by redirecting the user to the login page
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    return NextResponse.redirect(url);
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is.
  // If you're creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse;
}
