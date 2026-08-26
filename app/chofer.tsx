'use client';
import React, { useState } from 'react';

interface Entrega {
  id: number;
  cliente: string;
  direccion: string;
  productos: string;
  estado: 'Pendiente' | 'En Ruta' | 'Entregado';
}

export default function ModuloChofer() {
  const [entregas, setEntregas] = useState<Entrega[]>([
    { id: 1, cliente: 'Juan Pérez', direccion: 'Reparto Schick, Managua', productos: 'Smart TV Sony 55"', estado: 'Pendiente' },
    { id: 2, cliente: 'María Gómez', direccion: 'Villa El Carmen, Zona Central', productos: 'Cama King Size ortopédica', estado: 'En Ruta' },
    { id: 3, cliente: 'Carlos Ruiz', direccion: 'Colonia Centroamérica, Pista Principal', productos: 'Infinix Note 50 Pro', estado: 'Entregado' },
  ]);

  const cambiarEstado = (id: number, nuevoEstado: 'Pendiente' | 'En Ruta' | 'Entregado') => {
    setEntregas(
      entregas.map((item) => (item.id === id ? { ...item, estado: nuevoEstado } : item))
    );
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex justify-between items-center border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-2xl font-bold">🚚 Gestión de Rutas y Entregas - Tienda-SS</h1>
            <p className="text-slate-400 text-sm">Control de envíos de mercadería para la flota de transporte</p>
          </div>
          <span className="bg-amber-600/20 text-amber-400 border border-amber-500/30 px-3 py-1 rounded-full text-xs font-semibold">
            Rol: Chofer
          </span>
        </header>

        <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-lg overflow-hidden">
          <div className="p-4 border-b border-slate-700">
            <h2 className="text-lg font-semibold text-indigo-300">Asignación de Envíos del Día</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-900/60 text-slate-400 text-xs uppercase tracking-wider">
                  <th className="p-4">Cliente</th>
                  <th className="p-4">Dirección de Destino</th>
                  <th className="p-4">Productos a Entregar</th>
                  <th className="p-4 text-center">Estado del Envio</th>
                  <th className="p-4 text-center">Acciones de Ruta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700 text-sm">
                {entregas.map((envio) => (
                  <tr key={envio.id} className="hover:bg-slate-750 transition">
                    <td className="p-4 font-medium text-white">{envio.cliente}</td>
                    <td className="p-4 text-slate-300">{envio.direccion}</td>
                    <td className="p-4 text-slate-400">{envio.productos}</td>
                    <td className="p-4 text-center">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          envio.estado === 'Pendiente'
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                            : envio.estado === 'En Ruta'
                            ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                            : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        }`}
                      >
                        {envio.estado}
                      </span>
                    </td>
                    <td className="p-4 text-center space-x-1">
                      <button
                        onClick={() => cambiarEstado(envio.id, 'En Ruta')}
                        className="bg-blue-600/80 hover:bg-blue-600 text-white px-2.5 py-1.5 rounded-lg text-xs transition shadow"
                      >
                        En Ruta
                      </button>
                      <button
                        onClick={() => cambiarEstado(envio.id, 'Entregado')}
                        className="bg-emerald-600/80 hover:bg-emerald-600 text-white px-2.5 py-1.5 rounded-lg text-xs transition shadow"
                      >
                        Entregado
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
