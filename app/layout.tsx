import './globals.css';

export const metadata = {
  title: 'Tienda-SS - Sistema Logístico',
  description: 'Sistema de gestión de inventario, ventas y rutas de entrega',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="bg-slate-900 text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
