import './globals.css';
import type { Metadata, Viewport } from 'next';
import { ConnectivityToast } from '@/components/workspace/ConnectivityToast';

export const metadata: Metadata = {
  title: 'ConexiaX — Operaciones claras para negocios ambiciosos',
  description: 'La plataforma SaaS multiempresa para ventas, inventario, clientes y operaciones.',
  applicationName: 'ConexiaX',
  generator: 'Next.js',
  referrer: 'strict-origin-when-cross-origin',
  keywords: ['ERP', 'SaaS', 'ventas', 'inventario', 'ConexiaX'],
  icons: { icon: '/icon.svg', shortcut: '/icon.svg', apple: '/icon.svg' },
  manifest: '/manifest.webmanifest',
  formatDetection: { telephone: false },
  robots: { index: false, follow: false },
};

/**
 * Next.js App Router ya no inyecta la etiqueta viewport por defecto. Sin ella el
 * navegador del teléfono renderiza a ~980px y muestra la versión de escritorio
 * comprimida, así que se declara de forma explícita. `viewportFit: 'cover'` es
 * lo que habilita `env(safe-area-inset-*)` en pantallas con notch o barra inferior.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#102017',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" dir="ltr">
      <body>
        {children}
        <ConnectivityToast />
      </body>
    </html>
  );
}
