'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '@/lib/firebase';

type CheckStatus = 'idle' | 'running' | 'passed' | 'failed';
type Check = { id: string; label: string; detail: string; status: CheckStatus; result?: string };

const initialChecks: Check[] = [
  { id: 'health', label: 'Salud de la aplicación', detail: 'Comprueba que la API y sus dependencias responden.', status: 'idle' },
  { id: 'login-attempt', label: 'Pre-login', detail: 'Confirma que el bloqueo temporal propio no está activo.', status: 'idle' },
  { id: 'admin', label: 'Acceso administrativo', detail: 'Confirma que tu sesión tiene permisos de superadministrador.', status: 'idle' },
];

const manualSteps = [
  ['domain', 'Abrir siempre el dominio oficial', 'https://tienda-ss-ozkq.vercel.app'],
  ['login', 'Iniciar sesión con una cuenta verificada', ''],
  ['workspace', 'Llegar al workspace sin repetir onboarding', '/workspace'],
  ['company', 'Confirmar que aparece el nombre de la empresa', ''],
  ['reload', 'Recargar el workspace sin perder la sesión', ''],
  ['logout', 'Cerrar sesión y volver a iniciar sesión', ''],
] as const;

function StatusBadge({ status }: { status: CheckStatus }) {
  const text = status === 'passed' ? 'Correcto' : status === 'failed' ? 'Revisar' : status === 'running' ? 'Probando…' : 'Pendiente';
  return <span style={{ ...styles.badge, ...(status === 'passed' ? styles.ok : status === 'failed' ? styles.bad : status === 'running' ? styles.running : styles.idle) }}>{text}</span>;
}

export default function SuperadminTestingPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [checks, setChecks] = useState<Check[]>(initialChecks);
  const [manual, setManual] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState('');
  const [runningAll, setRunningAll] = useState(false);

  useEffect(() => onAuthStateChanged(auth, (current) => { setUser(current); setAuthLoading(false); }), []);

  const completedManual = useMemo(() => manualSteps.filter(([id]) => manual[id]).length, [manual]);
  const completedChecks = checks.filter((item) => item.status === 'passed').length;

  function updateCheck(id: string, patch: Partial<Check>) {
    setChecks((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  async function runCheck(id: string, currentUser: User) {
    updateCheck(id, { status: 'running', result: undefined });
    try {
      const token = await currentUser.getIdToken();
      if (id === 'health') {
        const response = await fetch('/api/health?ready=true', { cache: 'no-store' });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
        updateCheck(id, { status: 'passed', result: `HTTP ${response.status} · servicio listo` });
        return;
      }
      if (id === 'login-attempt') {
        const response = await fetch('/api/auth/login-attempt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: currentUser.email || '' }) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
        updateCheck(id, { status: 'passed', result: 'El límite propio no bloqueó la solicitud' });
        return;
      }
      const response = await fetch('/api/superadmin/metrics', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      updateCheck(id, { status: 'passed', result: `${data.metrics?.tenants ?? 0} empresas visibles · permisos confirmados` });
    } catch (error) {
      updateCheck(id, { status: 'failed', result: error instanceof Error ? error.message : 'Prueba fallida' });
    }
  }

  async function runAll() {
    if (!user) { setMessage('Inicia sesión con la cuenta de superadministrador para ejecutar las pruebas.'); return; }
    setMessage(''); setRunningAll(true);
    for (const check of initialChecks) await runCheck(check.id, user);
    setRunningAll(false);
  }

  if (authLoading) return <main style={styles.page}><div style={styles.loading}>Cargando consola de pruebas…</div></main>;

  return <main style={styles.page}>
    <header style={styles.header}>
      <div><span style={styles.kicker}>ConexiaX / Administración</span><h1 style={styles.title}>Centro de pruebas</h1><p style={styles.subtitle}>Una consola sencilla para verificar que la SaaS está lista antes de operar.</p></div>
      <div style={styles.headerActions}><Link href="/superadmin" style={styles.secondaryButton}>Panel global</Link><Link href="/" style={styles.secondaryButton}>Abrir ConexiaX</Link></div>
    </header>

    {!user && <div style={styles.warning}>No hay una sesión activa. Abre el login, entra con tu cuenta autorizada y vuelve a esta dirección.</div>}
    {message && <div style={styles.warning}>{message}</div>}

    <section style={styles.heroCard}>
      <div><span style={styles.kicker}>Estado de sesión</span><h2 style={styles.sectionTitle}>{user ? 'Sesión detectada' : 'Sesión no detectada'}</h2><p style={styles.muted}>{user ? `${user.email || 'Correo no disponible'} · UID ${user.uid}` : 'Las pruebas administrativas requieren una cuenta autenticada.'}</p></div>
      <StatusBadge status={user ? 'passed' : 'failed'} />
    </section>

    <section style={styles.grid}>
      <article style={styles.card}><div style={styles.cardHeader}><div><span style={styles.kicker}>Diagnóstico automático</span><h2 style={styles.sectionTitle}>Pruebas técnicas</h2></div><span style={styles.counter}>{completedChecks}/{checks.length}</span></div>{checks.map((check) => <div style={styles.checkRow} key={check.id}><div style={styles.checkText}><b style={styles.smallBold}>{check.label}</b><small style={styles.smallText}>{check.detail}</small>{check.result && <em style={styles.resultText}>{check.result}</em>}</div><StatusBadge status={check.status} /></div>)}<button type="button" style={styles.primaryButton} onClick={() => void runAll()} disabled={runningAll || !user}>{runningAll ? 'Ejecutando…' : 'Ejecutar diagnóstico'}</button></article>
      <article style={styles.card}><div style={styles.cardHeader}><div><span style={styles.kicker}>Prueba operativa</span><h2 style={styles.sectionTitle}>Checklist manual</h2></div><span style={styles.counter}>{completedManual}/{manualSteps.length}</span></div>{manualSteps.map(([id, label, href]) => <label style={styles.manualRow} key={id}><input style={styles.manualInput} type="checkbox" checked={Boolean(manual[id])} onChange={(event) => setManual((current) => ({ ...current, [id]: event.target.checked }))} /><span style={styles.manualText}><b style={styles.smallBold}>{label}</b>{href && (href.startsWith('http') ? <small style={styles.smallText}>{href}</small> : <Link href={href} style={styles.link}>Abrir {href}</Link>)}</span></label>)}</article>
    </section>

    <section style={styles.card}><div style={styles.cardHeader}><div><span style={styles.kicker}>Accesos rápidos</span><h2 style={styles.sectionTitle}>Módulos para probar</h2></div></div><div style={styles.linksGrid}>{[['/workspace', 'Workspace', 'Resumen general y nombre de empresa'], ['/workspace/catalog', 'Catálogo', 'Productos y precios'], ['/workspace/sales', 'Ventas / POS', 'Registrar una venta'], ['/workspace/presales', 'Preventas', 'Crear y cobrar preventas'], ['/workspace/inventory', 'Inventario', 'Stock y movimientos'], ['/workspace/cashier', 'Caja', 'Abrir, contar y cerrar caja'], ['/workspace/members', 'Miembros', 'Invitaciones y permisos'], ['/workspace/organization', 'Configuración', 'Moneda NIO / USD']].map(([href, label, detail]) => <Link href={href} style={styles.moduleLink} key={href}><b style={styles.smallBold}>{label} ↗</b><small style={styles.smallText}>{detail}</small></Link>)}</div></section>

    <footer style={styles.footer}>Dominio recomendado: <b>https://tienda-ss-ozkq.vercel.app</b> · No uses hostnames aleatorios de Vercel para probar acceso.</footer>
  </main>;
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: '#f5f8f3', color: '#263329', padding: '40px 6vw', fontFamily: 'inherit' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 24, marginBottom: 24 },
  headerActions: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  kicker: { color: '#6d963f', fontSize: 10, fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase' },
  title: { fontSize: 36, letterSpacing: -2, margin: '12px 0 5px' },
  subtitle: { color: '#7b887e', fontSize: 13, margin: 0 },
  secondaryButton: { background: '#fff', border: '1px solid #dce6da', borderRadius: 7, color: '#5e7462', fontSize: 11, padding: '11px 14px', textDecoration: 'none' },
  primaryButton: { background: '#14291d', border: 0, borderRadius: 7, color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 700, marginTop: 18, padding: '13px 16px', width: '100%' },
  warning: { background: '#fff3e5', border: '1px solid #f0d7b4', borderRadius: 7, color: '#a77135', fontSize: 11, marginBottom: 15, padding: '13px 16px' },
  heroCard: { alignItems: 'center', background: '#eaffc8', border: '1px solid #d8e9bb', borderRadius: 10, display: 'flex', justifyContent: 'space-between', padding: 22, marginBottom: 15 },
  grid: { display: 'grid', gap: 15, gridTemplateColumns: '1fr 1fr', marginBottom: 15 },
  card: { background: '#fff', border: '1px solid #e0e8df', borderRadius: 9, padding: 22, marginBottom: 15 },
  cardHeader: { alignItems: 'start', display: 'flex', justifyContent: 'space-between', gap: 10 },
  sectionTitle: { fontSize: 20, letterSpacing: -1, margin: '7px 0 18px' },
  muted: { color: '#708074', fontSize: 12, margin: '6px 0 0' },
  counter: { background: '#eef3eb', borderRadius: 20, color: '#6d806f', fontSize: 11, padding: '6px 9px' },
  checkRow: { alignItems: 'center', borderTop: '1px solid #eef2ed', display: 'flex', gap: 12, justifyContent: 'space-between', padding: '13px 0' },
  checkText: { display: 'flex', flexDirection: 'column', gap: 4 },
  checkTextSmall: { color: '#8b988e', fontSize: 10 },
  smallText: { color: '#8b988e', fontSize: 10 },
  smallBold: { fontSize: 11 },
  resultText: { color: '#6d806f', fontSize: 10, fontStyle: 'normal' },
  badge: { borderRadius: 20, fontSize: 9, fontWeight: 800, padding: '6px 8px', whiteSpace: 'nowrap' },
  ok: { background: '#eaf7d7', color: '#628c3a' },
  bad: { background: '#fff0dd', color: '#a97031' },
  running: { background: '#e8f0ff', color: '#5278ac' },
  idle: { background: '#f0f1ef', color: '#879188' },
  manualRow: { alignItems: 'flex-start', borderTop: '1px solid #eef2ed', cursor: 'pointer', display: 'flex', gap: 10, padding: '12px 0' },
  manualRowInput: { marginTop: 2 },
  manualRowSpan: { display: 'flex', flexDirection: 'column', gap: 4 },
  manualInput: { marginTop: 2 },
  manualText: { display: 'flex', flexDirection: 'column', gap: 4 },
  link: { color: '#6d963f', fontSize: 10, textDecoration: 'none' },
  linksGrid: { display: 'grid', gap: 10, gridTemplateColumns: 'repeat(4, 1fr)' },
  moduleLink: { background: '#f8fbf7', border: '1px solid #e5eee2', borderRadius: 7, color: '#324638', display: 'flex', flexDirection: 'column', gap: 6, padding: 13, textDecoration: 'none' },
  footer: { color: '#89968c', fontSize: 10, padding: '5px 0 20px' },
  loading: { color: '#6d806f', padding: 40, textAlign: 'center' },
};
