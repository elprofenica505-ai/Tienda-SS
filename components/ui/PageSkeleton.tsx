export function PageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <main className="page-skeleton" aria-busy="true" aria-label="Cargando contenido">
      <div className="skeleton-heading" />
      <div className="skeleton-subheading" />
      <section className="skeleton-grid">
        {Array.from({ length: rows }, (_, index) => <div className="skeleton-card" key={index} />)}
      </section>
    </main>
  );
}
