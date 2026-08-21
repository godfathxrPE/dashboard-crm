import type { NextConfig } from 'next';

// Security headers живут здесь, а не в конфиге платформы: Vercel читает headers()
// нативно, и настройка переезжает вместе с кодом. Единственный действующий источник
// заголовков. CSP-lite (object-src/base-uri/frame-ancestors): полный CSP с nonce для
// inline theme-init — отдельная задача.
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  // frame-src: whitelist embed-плееров (S-VIDEO-EMBED-1) — только хосты, которые
  // отдаёт parseVideoUrl (video-embed-helpers.ts); держать списки синхронно.
  {
    key: 'Content-Security-Policy',
    value:
      "object-src 'none'; base-uri 'self'; frame-ancestors 'none'; " +
      'frame-src https://www.youtube.com https://youtube.com https://vk.com https://vkvideo.ru https://rutube.ru',
  },
];

const nextConfig: NextConfig = {
  // Корень workspace пиним явно: Next иначе угадывает его по ближайшему lockfile
  // и может уехать выше по дереву. Исторически здесь лежал второй lockfile от
  // прежней платформы (удалён 2026-08-21); пин оставлен как защита от повторения.
  outputFileTracingRoot: __dirname,
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
