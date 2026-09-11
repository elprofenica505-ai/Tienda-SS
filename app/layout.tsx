import './globals.css';
import type { Metadata } from 'next';

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" dir="ltr">
      <body>{children}</body>
    </html>
  );
}
