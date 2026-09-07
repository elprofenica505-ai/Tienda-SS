'use client';

import { useState } from 'react';
import { TenantProvider, useTenant } from '@/components/tenant/TenantProvider';
import { beginPhoneMfaEnrollment, completePhoneMfaEnrollment, hasEnrolledMfa, type MfaEnrollment } from '@/lib/mfa';

const ADMIN_ROLES = new Set(['owner', 'admin', 'gerente', 'jefe']);

function SecurityContent() {
  const { authUser, member, loading } = useTenant();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [enrollment, setEnrollment] = useState<MfaEnrollment | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  if (loading) return <main className="workspace-page"><section className="workspace-main"><p>Cargando configuración de seguridad…</p></section></main>;
  if (!authUser || !member || !ADMIN_ROLES.has(member.role)) return <main className="workspace-page"><section className="workspace-main"><h1>Acceso restringido</h1><p>Solo los administradores pueden gestionar la autenticación multifactor.</p></section></main>;

  const enrolled = hasEnrolledMfa(authUser);

  async function startEnrollment() {
    setBusy(true); setMessage('');
    try {
      setEnrollment(await beginPhoneMfaEnrollment(phone, 'mfa-recaptcha'));
      setMessage('Enviamos un código de verificación al teléfono indicado.');
    } catch (error) {
      setMessage(error instanceof Error && error.message === 'PHONE_FORMAT' ? 'Usa formato internacional, por ejemplo +50588888888.' : 'No se pudo iniciar la inscripción MFA.');
    } finally { setBusy(false); }
  }

  async function finishEnrollment() {
    if (!enrollment) return;
    setBusy(true); setMessage('');
    try {
      await completePhoneMfaEnrollment(enrollment, code);
      setEnrollment(null); setCode(''); setMessage('MFA activado correctamente. En el próximo acceso se solicitará el segundo factor.');
    } catch (error) {
      setMessage(error instanceof Error && error.message === 'CODE_FORMAT' ? 'El código debe tener seis dígitos.' : 'No se pudo verificar el código MFA.');
    } finally { setBusy(false); }
  }

  return <main className="workspace-page"><section className="workspace-main"><header className="workspace-header"><div><small>Seguridad</small><h1>Protege tu acceso administrativo</h1></div></header><article className="auth-card" style={{ maxWidth: 640 }}><div className="auth-card-top"><span className="eyebrow">Autenticación multifactor</span><h2>{enrolled ? 'MFA está activo' : 'Activa un segundo factor'}</h2><p>{enrolled ? 'Tu cuenta ya tiene un factor adicional inscrito.' : 'Los roles administrativos deben tener MFA activo para acceder a datos y operaciones sensibles.'}</p></div>{!enrolled && !enrollment && <><label>Teléfono en formato internacional<input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+50588888888" inputMode="tel" /></label><div id="mfa-recaptcha" /><button className="button button-large auth-submit" onClick={() => void startEnrollment()} disabled={busy}>{busy ? 'Enviando código…' : 'Enviar código de verificación'}</button></>}{enrollment && <><label>Código de seis dígitos<input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="123456" inputMode="numeric" /></label><button className="button button-large auth-submit" onClick={() => void finishEnrollment()} disabled={busy}>{busy ? 'Verificando…' : 'Activar MFA'}</button></>}{message && <div className="form-message">{message}</div>}</article></section></main>;
}

export default function SecurityPage() {
  return <TenantProvider><SecurityContent /></TenantProvider>;
}
