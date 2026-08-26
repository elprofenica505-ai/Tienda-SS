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
      setError('Credenciales incorrectas. Verifica tu usuario y contraseña (1234).');
    }
  };

  if (!rol) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-2xl shadow-2xl p-8 space-y-6">
          
          {/* Encabezado */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 text-2xl font-bold mb-1 shadow-inner">
              ⚡
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-white">Tienda-SS</h1>
            <p className="text-sm text-slate-400">Sistema Logístico e Inventario Profesional</p>
          </div>

          {/* Formulario de Acceso */}
          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className="bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs p-3 rounded-xl text-center">
                {error}
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-300">Usuario de acceso</label>
              <input
                type="text"
                placeholder="Ej. bodega, vendedor, chofer, jefe"
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                className="w-full bg-slate-950/60 border border-slate-700/80 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-300">Contraseña</label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-950/60 border border-slate-700/80 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-500 active:scale-[0.99] text-white font-semibold rounded-xl py-3 text-sm shadow-lg shadow-indigo-600/30 transition duration-200"
            >
              Iniciar Sesión
            </button>
          </form>

          {/* Accesos rápidos de prueba */}
          <div className="border-t border-slate-800/80 pt-4 space-y-2">
            <p className="text-xs font-medium text-slate-400 text-center uppercase tracking-wider">
              Accesos rápidos (Clave: <span className="text-indigo-400 font-bold">1234</span>)
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-slate-950/40 border border-slate-800 p-2.5 rounded-lg">
                <span className="font-bold text-indigo-400 block">📦 bodega</span>
                <span className="text-slate-400 text-[11px]">Inventario</span>
              </div>
              <div className="bg-slate-950/40 border border-slate-800 p-2.5 rounded-lg">
                <span className="font-bold text-indigo-400 block">🛒 vendedor</span>
                <span className="text-slate-400 text-[11px]">Caja y catálogo</span>
              </div>
              <div className="bg-slate-950/40 border border-slate-800 p-2.5 rounded-lg">
                <span className="font-bold text-indigo-400 block">🚚 chofer</span>
                <span className="text-slate-400 text-[11px]">Rutas de entrega</span>
              </div>
              <div className="bg-slate-950/40 border border-slate-800 p-2.5 rounded-lg">
                <span className="font-bold text-indigo-400 block">⚡ jefe</span>
                <span className="text-slate-400 text-[11px]">Administración</span>
              </div>
            </div>
          </div>

        </div>
      </main>
    );
  }

  return (
    <div className="relative min-h-screen bg-slate-950">
      <div className="absolute top-4 right-4 z-50">
        <button
          onClick={() => setRol(null)}
          className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-4 py-2 rounded-xl text-xs font-medium shadow-md transition"
        >
          🚪 Cerrar Sesión
        </button>
      </div>

      {rol === 'bodega' && <InventarioBodega />}
      {rol === 'vendedor' && <ModuloVentas />}
      {rol === 'chofer' && <ModuloChofer />}
      {rol === 'jefe' && (
        <div className="min-h-screen bg-slate-900 text-slate-100 p-8 flex flex-col items-center justify-center space-y-6">
          <div className="max-w-xl w-full bg-slate-800 border border-slate-700 p-8 rounded-2xl shadow-xl text-center space-y-4">
            <h1 className="text-3xl font-bold text-indigo-400">Panel General de Administración</h1>
            <p className="text-slate-300 text-sm">
              Bienvenido al núcleo de control gerencial de Tienda-SS. Desde aquí supervisas operaciones globales, finanzas y logística.
            </p>
            <div className="grid grid-cols-2 gap-4 pt-4">
              <div className="bg-slate-900 p-4 rounded-xl border border-slate-700">
                <span className="text-2xl font-bold text-emerald-400 block">$12,450</span>
                <span className="text-xs text-slate-400">Ventas del Día</span>
              </div>
              <div className="bg-slate-900 p-4 rounded-xl border border-slate-700">
                <span className="text-2xl font-bold text-indigo-400 block">4 Rutas</span>
                <span className="text-xs text-slate-400">Activas en Ruta</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
