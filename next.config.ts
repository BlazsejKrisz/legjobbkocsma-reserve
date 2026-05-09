import type { NextConfig } from "next";

// Security headers applied to every response.
//
// Note on CSP: a strict `script-src 'self'` breaks Next.js because
// next-themes injects an inline FOUC-prevention script and Next itself
// emits inline bootstrap scripts during hydration; without `unsafe-
// inline` (or a nonce per request) the dashboard hangs at loading.
// The proper long-term fix is nonce-based CSP wired through proxy.ts,
// but that's a bigger change.  In the meantime we ship a permissive
// script-src and lock down the rest of the directives.
//
// What this CSP still buys you:
//   * frame-ancestors 'none' — clickjacking
//   * object-src 'none' — Flash/Java applet vectors
//   * base-uri 'self' — base-tag injection
//   * connect-src whitelist — exfil targets
//   * form-action 'self' — submit hijacking
//
// What it does NOT block (until nonce-based CSP is wired):
//   * inline scripts — needed by next-themes + Next.js hydration
//   * eval-style scripts in dev — needed by HMR
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const supabaseHost = (() => {
  try {
    return SUPABASE_URL ? new URL(SUPABASE_URL).host : ''
  } catch {
    return ''
  }
})()

const isDev = process.env.NODE_ENV !== 'production'

const cspParts = [
  "default-src 'self'",
  // data: for favicons + inlined SVG icons; blob: for client-generated
  // image previews (e.g. venue logo upload preview); supabase storage
  // for venue logos served from the public bucket.
  `img-src 'self' data: blob: https://*.supabase.co${supabaseHost ? ` https://${supabaseHost}` : ''}`,
  // Tailwind / Radix portals inject style tags at runtime.
  "style-src 'self' 'unsafe-inline'",
  // 'unsafe-inline' is required by next-themes + Next.js hydration.
  // 'unsafe-eval' is only needed in dev (Webpack/Turbopack HMR).
  isDev
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  `connect-src 'self' https://*.supabase.co${supabaseHost ? ` https://${supabaseHost}` : ''} wss://*.supabase.co https://*.upstash.io`,
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: cspParts },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
]

const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    optimizePackageImports: ['lucide-react', 'date-fns', 'recharts'],
  },
  async headers() {
    return [
      {
        // Apply to everything except public booking endpoints — those
        // need permissive CORS and are managed in the route handler.
        source: '/((?!api/public).*)',
        headers: securityHeaders,
      },
    ]
  },
};

export default nextConfig;
