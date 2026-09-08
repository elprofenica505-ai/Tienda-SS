'use client';

import React, { useState } from 'react';

interface Props {
  onLogin: (email: string, password: string) => Promise<any>;
}

export default function Login({ onLogin }: Props) {
  const [emailInput, setEmailInput] = useState('');
  const [passInput, setPassInput] = useState('');
  const [errorLogin, setErrorLogin] = useState('');
  const [cargandoLogin, setCargandoLogin] = useState(false);

  const manejarLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorLogin('');
    setCargandoLogin(true);
    try {
      await onLogin(emailInput.trim(), passInput);
      setEmailInput('');
      setPassInput('');
    } catch (err: any) {
      setErrorLogin(
        err?.message?.includes('desactivado')
          ? err.message
          : 'Correo o contraseña incorrectos'
      );
    } finally {
      setCargandoLogin(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#030712', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: 'sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 380, background: '#111827', border: '1px solid #1f2937', borderRadius: 20, padding: 28 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: '#fff', margin: 0 }}>Tienda-SS</h1>
          <p style={{ fontSize: 13, color: '#9ca3af', margin: '6px 0 0' }}>Sistema de gestión logística</p>
        </div>

        <form onSubmit={manejarLogin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="email"
            placeholder="Correo"
            value={emailInput}
            onChange={e => setEmailInput(e.target.value)}
            required
            autoComplete="email"
            style={{ background: '#030712', border: '1px solid #374151', borderRadius: 12, padding: 14, color: '#fff', fontSize: 14, outline: 'none' }}
          />
          <input
            type="password"
            placeholder="Contraseña"
            value={passInput}
            onChange={e => setPassInput(e.target.value)}
            required
            autoComplete="current-password"
            style={{ background: '#030712', border: '1px solid #374151', borderRadius: 12, padding: 14, color: '#fff', fontSize: 14, outline: 'none' }}
          />
          {errorLogin && (
            <p style={{ color: '#f87171', fontSize: 13, margin: 0, textAlign: 'center' }}>{errorLogin}</p>
          )}
          <button
            type="submit"
            disabled={cargandoLogin}
            style={{ background: '#4f46e5', color: '#fff', border: 'none', padding: 14, borderRadius: 12, fontWeight: 700, fontSize: 15, cursor: 'pointer', marginTop: 4 }}
          >
            {cargandoLogin ? 'Entrando...' : 'Iniciar sesión'}
          </button>
        </form>

        <p style={{ color: '#9ca3af', fontSize: 12, lineHeight: 1.5, textAlign: 'center', margin: '18px 0 0' }}>
          Usa tu cuenta real de empresa. Si todavía no tienes un espacio, vuelve al inicio para crear uno.
        </p>
      </div>
    </div>
  );
}
