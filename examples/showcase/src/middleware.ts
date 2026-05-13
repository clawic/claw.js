import { NextRequest, NextResponse } from "next/server";

/**
 * Next.js middleware for API route protection.
 *
 * For a local-first app running on localhost, the primary threat is
 * cross-origin requests from malicious websites (CSRF). We validate
 * the Origin header to ensure only requests from localhost are allowed.
 */
/** Hostnames that are always allowed (local development). */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

/**
 * Extra allowed origins from CLAW_ALLOWED_ORIGINS (comma-separated hostnames
 * or full origins, e.g. "demo.clawjs.ai,staging.clawjs.ai").
 */
function getAllowedHosts(): Set<string> {
  const extra = process.env.CLAW_ALLOWED_ORIGINS?.trim();
  if (!extra) return LOCAL_HOSTS;
  const hosts = new Set(LOCAL_HOSTS);
  for (const entry of extra.split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    // Accept both bare hostnames ("demo.clawjs.ai") and full origins ("https://demo.clawjs.ai")
    try {
      const parsed = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
      hosts.add(parsed.hostname);
    } catch {
      hosts.add(trimmed);
    }
  }
  return hosts;
}

export function middleware(request: NextRequest) {
  // CSRF protection: if an Origin header is present, it must be an allowed host
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      const url = new URL(origin);
      const hostname = url.hostname;
      if (!getAllowedHosts().has(hostname)) {
        return new NextResponse(
          JSON.stringify({ error: "Forbidden", message: "Cross-origin requests are not allowed." }),
          {
            status: 403,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
    } catch {
      return new NextResponse(
        JSON.stringify({ error: "Forbidden", message: "Invalid Origin header." }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
