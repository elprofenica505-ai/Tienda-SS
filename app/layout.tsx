import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Tienda-SS - Sistema Logístico e Inventario',
  description: 'Sistema profesional de gestión de inventario, ventas, rutas y administración',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="bg-slate-950 text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
