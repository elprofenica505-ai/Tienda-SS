'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';

function AcceptInvitationContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token') || '';
  const [invitation, setInvitation] = useState<{ email: string; role: string; expiresAt?: string } | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('Cargando invitación...');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token) { setMessage('El enlace de invitación está incompleto.'); return; }
    void fetch(`/api/invitations/accept?token=${encodeURIComponent(token)}`, { cache: 'no-store' }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'La invitación no es válida.');
      setInvitation(data.invitation); setMessage('');
    }).catch((error) => setMessage(error instanceof Error ? error.message : 'No se pudo cargar la invitación.'));
  }, [token]);

  async function accept(event: FormEvent) {
    event.preventDefault();
    if (!invitation) return;
    setSaving(true); setMessage('');
    try {
      const currentUser = auth.currentUser;
      const response = await fetch('/api/invitations/accept', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(currentUser ? { Authorization: `Bearer ${await currentUser.getIdToken()}` } : {}) }, body: JSON.stringify({ token, email: invitation.email, name, password }) });
      const data = await response.json();
      if (response.status === 409 && data.uid) throw new Error('Ese correo ya tiene una cuenta. Inicia sesión con esa cuenta y vuelve a abrir este enlace para aceptar la invitación.');
      if (!response.ok) throw new Error(data.error || 'No se pudo aceptar la invitación.');
      if (!currentUser) await signInWithEmailAndPassword(auth, invitation.email, password);
      router.replace('/onboarding');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo aceptar la invitación.'); }
    finally { setSaving(false); }
  }

  return <main className="auth-page"><div className="auth-layout page-container"><div className="auth-card"><div className="auth-card-top"><span className="eyebrow">Invitación de equipo</span><h1>Únete a tu empresa.</h1>{invitation ? <p>Te invitaron como <strong>{invitation.role}</strong> con el correo <strong>{invitation.email}</strong>.</p> : <p>{message}</p>}</div>{invitation && <form className="onboarding-form" onSubmit={accept}><label>Tu nombre<input required minLength={2} value={name} onChange={(event) => setName(event.target.value)} placeholder="Nombre completo" /></label><label>Crea tu contraseña<input required minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mínimo 8 caracteres" autoComplete="new-password" /></label>{message && <div className="form-message" role="alert">{message}</div>}<button className="button button-large" disabled={saving}>{saving ? 'Activando acceso...' : 'Aceptar invitación ↗'}</button></form>}{!invitation && message !== 'Cargando invitación...' && <button className="button" onClick={() => router.push('/')}>Volver al inicio</button>}</div></div></main>;
}

export default function AcceptInvitationPage() {
  return <Suspense fallback={<main className="onboarding-loading">Cargando invitación...</main>}><AcceptInvitationContent /></Suspense>;
}
