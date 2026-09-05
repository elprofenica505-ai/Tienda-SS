import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'NexoFlow — Operaciones claras para negocios ambiciosos',
  description: 'La plataforma SaaS multiempresa para ventas, inventario, clientes y operaciones.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
