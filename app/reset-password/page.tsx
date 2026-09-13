'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowser } from '@/lib/supabase/client';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password.length < 8 || password !== confirmation) {
      setMessage(password !== confirmation ? 'Las contraseñas no coinciden.' : 'La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    setLoading(true); setMessage('');
    try {
      const { error } = await getSupabaseBrowser().auth.updateUser({ password });
      if (error) throw new Error(error.message);
      setMessage('Contraseña actualizada. Ya puedes iniciar sesión.');
      setTimeout(() => router.push('/login'), 1200);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo actualizar la contraseña.');
    } finally { setLoading(false); }
  }

  return <main className="auth-page"><div className="auth-layout page-container"><div className="auth-card" style={{ maxWidth: 520, margin: '80px auto' }}><div className="auth-card-top"><span className="eyebrow">Seguridad</span><h2>Nueva contraseña</h2><p>Escribe una contraseña nueva para proteger tu cuenta.</p></div><form onSubmit={submit}><label>Nueva contraseña<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required /></label><label>Confirmar contraseña<input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} minLength={8} required /></label>{message && <div className="form-message">{message}</div>}<button className="button button-large auth-submit" disabled={loading}>{loading ? 'Guardando…' : 'Actualizar contraseña'}</button></form></div></div></main>;
}
