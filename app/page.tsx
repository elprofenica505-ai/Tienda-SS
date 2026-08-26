'use client';
import React, { useState } from 'react';
import InventarioBodega from './inventario';
import ModuloVentas from './ventas';
import ModuloChofer from './chofer';

export default function TiendaSSApp() {
  const [rol, setRol] = useState<string | null>(null);
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const userClean = usuario.trim().toLowerCase();

    if (
      (userClean === 'jefe' || userClean === 'bodega' || userClean === 'vendedor' || userClean === 'chofer') &&
      password === '1234'
    ) {
      setRol(userClean);
    } else {
      setError('Credenciales incorrectas. Usa clave: 1234');
    }
  };

  if (!rol) {
    return (
      <main style={{
        minHeight: '100vh',
        backgroundColor: '#030712',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
      }}>
        <div style={{
          width: '100%',
          maxWidth: '420px',
          backgroundColor: '#111827',
          border: '1px solid #1f2937',
          borderRadius: '24px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          padding: '32px',
          boxSizing: 'border-box'
        }}>
          
          {/* Logo e Icono */}
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '60px',
              height: '60px',
              borderRadius: '18px',
              backgroundColor: 'rgba(99, 102, 241, 0.15)',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              color: '#818cf8',
              fontSize: '26px',
              marginBottom: '12px'
            }}>
              ⚡
            </div>
            <h1 style={{ color: '#ffffff', fontSize: '24px', fontWeight: 800, margin: '0 0 4px 0' }}>Tienda-SS</h1>
            <p style={{ color: '#9ca3af', fontSize: '13px', margin: 0 }}>Sistema Logístico e Inventario Profesional</p>
          </div>

          {/* Formulario */}
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {error && (
              <div style={{
                backgroundColor: 'rgba(244, 63, 94, 0.1)',
                border: '1px solid rgba(244, 63, 94, 0.3)',
                color: '#fb7185',
                fontSize: '12px',
                padding: '12px',
                borderRadius: '12px',
                textAlign: 'center'
              }}>
                {error}
              </div>
            )}

            <div>
              <label style={{ display: 'block', color: '#d1d5db', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>
                Usuario de acceso
              </label>
              <input
                type="text"
                placeholder="ej. bodega, vendedor, chofer, jefe"
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                style={{
                  width: '100%',
                  backgroundColor: '#030712',
                  border: '1px solid #374151',
                  borderRadius: '12px',
                  padding: '12px 16px',
                  fontSize: '14px',
                  color: '#ffffff',
                  boxSizing: 'border-box',
                  outline: 'none'
                }}
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', color: '#d1d5db', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>
                Contraseña
              </label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: '100%',
                  backgroundColor: '#030712',
                  border: '1px solid #374151',
                  borderRadius: '12px',
                  padding: '12px 16px',
                  fontSize: '14px',
                  color: '#ffffff',
                  boxSizing: 'border-box',
                  outline: 'none'
                }}
                required
              />
            </div>

            <button
              type="submit"
              style={{
                width: '100%',
                backgroundColor: '#4f46e5',
                color: '#ffffff',
                fontWeight: 600,
                borderRadius: '12px',
                padding: '14px',
                fontSize: '14px',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 10px 15px -3px rgba(79, 70, 229, 0.4)',
                marginTop: '4px'
              }}
            >
              Iniciar Sesión
            </button>
          </form>

          {/* Accesos rápidos visuales y ordenados */}
          <div style={{ borderTop: '1px solid #1f2937', marginTop: '24px', paddingTop: '16px' }}>
            <p style={{ color: '#9ca3af', fontSize: '11px', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px', fontWeight: 600 }}>
              Accesos rápidos (Clave: <span style={{ color: '#818cf8' }}>1234</span>)
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div style={{ backgroundColor: '#030712', border: '1px solid #1f2937', padding: '10px', borderRadius: '10px' }}>
                <span style={{ color: '#818cf8', fontWeight: 700, fontSize: '12px', display: 'block' }}>📦 bodega</span>
                <span style={{ color: '#9ca3af', fontSize: '10px' }}>Inventario</span>
              </div>
              <div style={{ backgroundColor: '#030712', border: '1px solid #1f2937', padding: '10px', borderRadius: '10px' }}>
                <span style={{ color: '#38bdf8', fontWeight: 700, fontSize: '12px', display: 'block' }}>🛒 vendedor</span>
                <span style={{ color: '#9ca3af', fontSize: '10px' }}>Caja y Catálogo</span>
              </div>
              <div style={{ backgroundColor: '#030712', border: '1px solid #1f2937', padding: '10px', borderRadius: '10px' }}>
                <span style={{ color: '#34d399', fontWeight: 700, fontSize: '12px', display: 'block' }}>🚚 chofer</span>
                <span style={{ color: '#9ca3af', fontSize: '10px' }}>Rutas</span>
              </div>
              <div style={{ backgroundColor: '#030712', border: '1px solid #1f2937', padding: '10px', borderRadius: '10px' }}>
                <span style={{ color: '#f43f5e', fontWeight: 700, fontSize: '12px', display: 'block' }}>⚡ jefe</span>
                <span style={{ color: '#9ca3af', fontSize: '10px' }}>Administración</span>
              </div>
            </div>
          </div>

        </div>
      </main>
    );
  }

  return (
    <div style={{ position: 'relative', minHeight: '100vh', backgroundColor: '#030712' }}>
      <div style={{ position: 'absolute', top: '16px', right: '16px', zIndex: 50 }}>
        <button
          onClick={() => setRol(null)}
          style={{
            backgroundColor: '#1f2937',
            color: '#e5e7eb',
            border: '1px solid #374151',
            padding: '8px 16px',
            borderRadius: '10px',
            fontSize: '12px',
            fontWeight: 500,
            cursor: 'pointer'
          }}
        >
          🚪 Cerrar Sesión
        </button>
      </div>

      {rol === 'bodega' && <InventarioBodega />}
      {rol === 'vendedor' && <ModuloVentas />}
      {rol === 'chofer' && <ModuloChofer />}
      {rol === 'jefe' && (
        <div style={{ minHeight: '100vh', backgroundColor: '#030712', color: '#f3f4f6', padding: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ maxWidth: '500px', width: '100%', backgroundColor: '#111827', border: '1px solid #1f2937', padding: '32px', borderRadius: '20px', textAlign: 'center' }}>
            <h1 style={{ color: '#818cf8', fontSize: '24px', fontWeight: 'bold', marginBottom: '12px' }}>Panel General de Administración</h1>
            <p style={{ color: '#9ca3af', fontSize: '14px', lineHeight: 1.5, marginBottom: '24px' }}>
              Bienvenido al núcleo operativo general de Tienda-SS. Supervisión general y métricas en tiempo real.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div style={{ backgroundColor: '#030712', padding: '16px', borderRadius: '12px', border: '1px solid #1f2937' }}>
                <span style={{ fontSize: '20px', fontWeight: 'bold', color: '#34d399', display: 'block' }}>$12,450</span>
                <span style={{ fontSize: '11px', color: '#9ca3af' }}>Ventas Totales</span>
              </div>
              <div style={{ backgroundColor: '#030712', padding: '16px', borderRadius: '12px', border: '1px solid #1f2937' }}>
                <span style={{ fontSize: '20px', fontWeight: 'bold', color: '#818cf8', display: 'block' }}>4 Rutas</span>
                <span style={{ fontSize: '11px', color: '#9ca3af' }}>Camiones en Ruta</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
