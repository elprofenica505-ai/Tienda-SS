/**
 * El endurecimiento de cabeceras (CSP con `frame-ancestors`, X-Frame-Options y
 * HSTS) se aplica sólo en el despliegue de producción. En desarrollo y en los
 * despliegues de vista previa se mantiene permisivo para no romper el iframe de
 * la vista previa ni el recargado en caliente de Next.js.
 */
const isProduction = process.env.VERCEL_ENV === 'production';

/** Origen de Supabase para `connect-src` (el navegador lo usa para autenticación). */
function supabaseOrigins() {
  const raw = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  if (!raw) return [];
  try {
    const origin = new URL(raw).origin;
    return [origin, origin.replace(/^https:/, 'wss:')];
  } catch {
    return [];
  }
}

function contentSecurityPolicy() {
  const connect = ["'self'", ...supabaseOrigins()].join(' ');
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
    "manifest-src 'self'",
    "worker-src 'self' blob:",
    // Next.js inyecta scripts de hidratación en línea; sin infraestructura de
    // nonces se requiere 'unsafe-inline'. `unsafe-eval` queda sólo en desarrollo.
    `script-src 'self' 'unsafe-inline'${isProduction ? '' : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'",
    // Las imágenes de producto pueden venir de cualquier URL https.
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src ${connect}`,
    ...(isProduction ? ["frame-ancestors 'none'", 'upgrade-insecure-requests'] : []),
  ].join('; ');
}

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  { key: 'Content-Security-Policy', value: contentSecurityPolicy() },
  ...(isProduction
    ? [
        // Fuerza HTTPS durante un año e impide que un atacante degrade la conexión.
        { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
        { key: 'X-Frame-Options', value: 'DENY' },
      ]
    : []),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  compress: true,
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
      {
        source: '/_next/static/(.*)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/icon.svg',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }],
      },
      {
        source: '/(.*\\.(?:avif|gif|ico|jpe?g|png|svg|webp|woff2?))',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ];
  },
};

export default nextConfig;

// Keep authenticated API responses non-cacheable. They are intentionally
// controlled by each route because their payloads are tenant-specific.
