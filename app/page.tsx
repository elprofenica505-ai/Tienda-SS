'client'
import React, { useState } from 'react';

export default function LoginPage() {
  const [rolSeleccionado, setRolSeleccionado] = useState('vendedor');
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');

  const manejarLogin = (e: React.FormEvent) => {
    e.preventDefault();
    alert(`Iniciando sesión como: ${rolSeleccionado.toUpperCase()}`);
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-md p-8 shadow-2xl">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white tracking-wide">📦 Logística Tienda-SS</h1>
          <p className="text-slate-400 text-sm mt-1">Selecciona tu rol e ingresa al sistema</p>
        </div>

        <form onSubmit={manejarLogin} className="space-y-5">
          {/* Selector de Roles */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Rol de Acceso
            </label>
            <select
              value={rolSeleccionado}
              onChange={(e) => setRolSeleccionado(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="jefe">👑 Jefe / Administrador</option>
              <option value="bodeguero">📦 Bodeguero (Inventario/Stock)</option>
              <option value="vendedor">🏷️ Vendedor (Ventas/Catálogo)</option>
              <option value="chofer">🚚 Chofer (Entregas y Rutas)</option>
              <option value="tesorero">💰 Tesorero (Pagos y Finanzas)</option>
              <option value="recepcionista">🛎️ Recepcionista</option>
            </select>
          </div>

          {/* Usuario */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Usuario o Correo
            </label>
            <input
              type="text"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              placeholder="Ej. usuario.tienda"
              required
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Contraseña */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Botón de Ingreso */}
          <button
            type="submit"
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-3 rounded-lg transition duration-200 shadow-lg shadow-indigo-600/30"
          >
            Entrar al Sistema
          </button>
        </form>
      </div>
    </div>
  );
}
