'use client';
import React, { useState } from 'react';
import InventarioBodega from './inventario';
import ModuloVentas from './ventas';
import ModuloChofer from './chofer';

export default function TiendaSSApp() {
  const [rol, setRol] = useState<string | null>(null);
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (usuario === 'jefe' && password === '1234') setRol('jefe');
    else if (usuario === 'bodega' && password === '1234') setRol('bodega');
    else if (usuario === 'vendedor' && password === '1234') setRol('vendedor');
    else if (usuario === 'chofer' && password === '1234') setRol('chofer');
    else alert('Credenciales incorrectas. Prueba usuario: jefe / bodega / vendedor / chofer (contraseña: 1234)');
  };

  if (!rol) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-6">
        <div className="bg-slate-800 border border-slate-700 p-8 rounded-2xl shadow-2xl w-full max-w-md space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-extrabold text-indigo-400">Tienda-SS</h1>
            <p className="text-slate-400 text-sm">Sistema Logístico e Inventario de Tienda</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                Usuario (jefe, bodega, vendedor, chofer)
              </label>
              <input
                type="text"
                placeholder="Ej. bodega"
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-indigo-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                Contraseña
              </label>
              <input
                type="password"
                placeholder="••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-indigo-500"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-3 rounded-lg transition shadow-lg text-sm"
            >
              Iniciar Sesión
            </button>
          </form>
          <div className="bg-slate-900/60 p-3 rounded-lg text-xs text-slate-400 space-y-1">
            <p className="font-semibold text-slate-300">Accesos de prueba (Contraseña: 1234):</p>
            <p>• <b>bodega</b>: Control de inventario</p>
            <p>• <b>vendedor</b>: Caja y catálogo</p>
            <p>• <b>chofer</b>: Rutas de entrega</p>
            <p>• <b>jefe</b>: Panel general de administración</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <nav className="bg-slate-800 border-b border-slate-700 px-6 py-3 flex justify-between items-center shadow">
        <div className="flex items-center space-x-3">
          <span className="font-bold text-lg text-indigo-400">Tienda-SS</span>
          <span className="text-xs bg-slate-700 px-2.5 py-1 rounded-full text-slate-300 uppercase">
            Rol: {rol}
          </span>
        </div>
        <button
          onClick={() => setRol(null)}
          className="bg-rose-600/80 hover:bg-rose-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition shadow"
        >
          Cerrar Sesión
        </button>
      </nav>

      <main>
        {rol === 'bodega' && <InventarioBodega />}
        {rol === 'vendedor' && <ModuloVentas />}
        {rol === 'chofer' && <ModuloChofer />}
        {rol === 'jefe' && (
          <div className="p-6 max-w-6xl mx-auto space-y-6">
            <h1 className="text-2xl font-bold">👑 Panel General de Administración (Jefe)</h1>
            <p className="text-slate-400">Bienvenido al centro de mando. Aquí puedes supervisar todos los módulos:</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
              <div onClick={() => setRol('bodega')} className="bg-slate-800 border border-slate-700 p-6 rounded-xl cursor-pointer hover:border-indigo-500 transition shadow">
                <h3 className="text-lg font-bold text-indigo-300">📦 Inventario Bodega</h3>
                <p className="text-slate-400 text-sm mt-2">Gestionar entradas, salidas y existencias físicas.</p>
              </div>
              <div onClick={() => setRol('vendedor')} className="bg-slate-800 border border-slate-700 p-6 rounded-xl cursor-pointer hover:border-indigo-500 transition shadow">
                <h3 className="text-lg font-bold text-emerald-300">🏷️ Módulo de Ventas</h3>
                <p className="text-slate-400 text-sm mt-2">Consultar catálogo, precios y facturar a clientes.</p>
              </div>
              <div onClick={() => setRol('chofer')} className="bg-slate-800 border border-slate-700 p-6 rounded-xl cursor-pointer hover:border-indigo-500 transition shadow">
                <h3 className="text-lg font-bold text-amber-300">🚚 Rutas de Envíos</h3>
                <p className="text-slate-400 text-sm mt-2">Supervisar entregas y estados de transporte.</p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
