import type { NextConfig } from 'next';

// Security headers — перенесены из netlify.toml [[headers]] в next.config,
// чтобы жить на любой платформе (Vercel читает headers() нативно; Netlify —
// через @netlify/plugin-nextjs). CSP-lite (object-src/base-uri/frame-ancestors):
// полный CSP с nonce для inline theme-init — отдельная задача.
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Content-Security-Policy', value: "object-src 'none'; base-uri 'self'; frame-ancestors 'none'" },
];

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
