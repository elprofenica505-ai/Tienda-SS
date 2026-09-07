import Link from 'next/link';

export default function PrivacyPage() {
  return (
    <main className="auth-page">
      <div className="auth-layout page-container">
        <article className="auth-card" style={{ maxWidth: 760, gridColumn: '1 / -1' }}>
          <div className="auth-card-top">
            <span className="eyebrow">ConexiaX</span>
            <h1>Política de privacidad</h1>
            <p>Esta página resume cómo se deben tratar los datos de las empresas, usuarios y operaciones dentro de la plataforma.</p>
          </div>
          <section>
            <h2>Datos que procesamos</h2>
            <p>Procesamos los datos necesarios para autenticación, gestión de empresas, ventas, inventario, clientes, facturación y soporte operativo.</p>
            <h2>Separación entre empresas</h2>
            <p>La información operativa se almacena asociada a una empresa y el acceso se valida mediante autenticación, membresía y permisos.</p>
            <h2>Solicitudes y contacto</h2>
            <p>Las solicitudes de acceso, corrección o eliminación deben gestionarse a través del responsable de la cuenta y del canal de soporte definido para el entorno de producción.</p>
          </section>
          <Link className="text-link" href="/">← Volver al inicio</Link>
        </article>
      </div>
    </main>
  );
}
