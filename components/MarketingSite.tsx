'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { login as loginWithFirebase, requestPasswordRecovery, sendVerification } from '@/lib/auth';
import { completeMfaSignIn, beginMfaSignIn, type MfaChallenge } from '@/lib/mfa';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';

type View = 'home' | 'login' | 'register';

const modules = [
  { number: '01', title: 'Ventas y cobros', text: 'Registra ventas, preventas, clientes, pagos y crédito básico en un solo espacio.' },
  { number: '02', title: 'Catálogo e inventario', text: 'Controla productos, servicios, existencias, mínimos y movimientos auditados.' },
  { number: '03', title: 'Clientes y crédito', text: 'Centraliza clientes, límites de crédito, abonos y cuentas por cobrar.' },
  { number: '04', title: 'Compras y recepción', text: 'Registra proveedores, recibe mercancía y actualiza existencias con trazabilidad.' },
  { number: '05', title: 'Caja y gastos', text: 'Consulta cobros, gastos y movimientos básicos de efectivo por empresa.' },
  { number: '06', title: 'Métricas operativas', text: 'Consulta ventas, gastos, productos destacados, métodos de pago y cartera.' },
];

const plans = [
  { name: 'Starter', price: '19', description: 'Para comenzar con orden', features: ['1 empresa', '3 usuarios', 'Catálogo e inventario', 'Ventas y caja'] },
  { name: 'Growth', price: '49', description: 'Para equipos que crecen', features: ['15 usuarios', 'Más capacidad operativa', 'Compras y proveedores', 'Reportes ampliados'], featured: true },
  { name: 'Scale', price: '99', description: 'Para operaciones exigentes', features: ['Mayor capacidad', 'API e integraciones', 'Controles avanzados', 'Atención prioritaria'], featured: false },
];

function Logo() {
  return (
    <div className="brand-mark">
      <span className="brand-mark-icon">N</span>
      <span>ConexiaX</span>
    </div>
  );
}

function Arrow() {
  return <span aria-hidden="true">↗</span>;
}

function Landing({ onNavigate }: { onNavigate: (view: View) => void }) {
  return (
    <main className="marketing-page">
      <div className="marketing-noise" />
      <nav className="marketing-nav page-container">
        <button className="brand-button" onClick={() => onNavigate('home')} aria-label="Ir al inicio"><Logo /></button>
        <div className="nav-links">
          <a href="#modulos">Módulos</a>
          <a href="#como-funciona">Cómo funciona</a>
          <a href="#precios">Precios</a>
        </div>
        <div className="nav-actions">
          <button className="nav-login" onClick={() => onNavigate('login')}>Iniciar sesión</button>
          <button className="button button-small" onClick={() => onNavigate('register')}>Crear empresa <Arrow /></button>
        </div>
      </nav>

      <section className="hero page-container">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-dot" /> La plataforma para operar mejor</div>
          <h1>Tu negocio, <em>en una sola vista.</em></h1>
          <p className="hero-lede">ConexiaX reúne ventas, inventario, clientes, crédito y operaciones básicas en un espacio claro para que tu empresa trabaje con más orden.</p>
          <div className="hero-actions">
            <button className="button button-large" onClick={() => onNavigate('register')}>Comenzar gratis <Arrow /></button>
            <a className="text-link" href="#modulos">Explorar módulos <span>↓</span></a>
          </div>
          <div className="hero-proof"><div className="avatar-stack"><i>JD</i><i>ML</i><i>AR</i><i>+</i></div><span><strong>Sin tarjeta de crédito</strong><br />Prueba la operación completa</span></div>
        </div>
        <div className="hero-visual" aria-label="Vista previa del panel de ConexiaX">
          <div className="glow glow-one" /><div className="glow glow-two" />
          <div className="dashboard-window">
            <div className="window-top"><div className="window-dots"><i /><i /><i /></div><span>ConexiaX.app / dashboard</span><b>•••</b></div>
            <div className="dashboard-body">
              <aside className="mini-sidebar"><Logo /><div className="mini-menu active"><span>▦</span> Resumen</div><div className="mini-menu"><span>◈</span> Ventas</div><div className="mini-menu"><span>◇</span> Inventario</div><div className="mini-menu"><span>○</span> Clientes</div><div className="mini-menu"><span>≡</span> Reportes</div><div className="mini-sidebar-bottom">Configuración<br /><small>Plan Growth</small></div></aside>
              <div className="mini-content"><div className="mini-header"><div><small>Jueves, 05 de septiembre</small><h3>Buenos días, Carlos <span>✦</span></h3></div><div className="mini-header-actions"><span>⌕</span><span>♧</span><b>CS</b></div></div>
                <div className="metric-grid"><div className="metric-card"><small>Ventas del mes</small><strong>C$24,890.00</strong><span className="positive">↑ 12.8%</span></div><div className="metric-card"><small>Tickets cobrados</small><strong>284</strong><span className="positive">↑ 8.4%</span></div><div className="metric-card"><small>Ticket promedio</small><strong>C$87.64</strong><span className="neutral">— 2.1%</span></div></div>
                <div className="mini-panels"><div className="chart-card"><div className="panel-title"><b>Rendimiento de ventas</b><span>Últimos 7 días⌄</span></div><div className="chart-area"><div className="chart-lines"><i /><i /><i /><i /></div><svg viewBox="0 0 450 145" preserveAspectRatio="none"><defs><linearGradient id="chartfill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#b8f36b" stopOpacity=".38" /><stop offset="1" stopColor="#b8f36b" stopOpacity="0" /></linearGradient></defs><path d="M0,118 C35,108 44,85 75,96 S110,116 140,82 S180,74 204,83 S240,92 269,55 S301,66 330,46 S366,30 391,48 S425,52 450,15 V145 H0Z" fill="url(#chartfill)" /><path d="M0,118 C35,108 44,85 75,96 S110,116 140,82 S180,74 204,83 S240,92 269,55 S301,66 330,46 S366,30 391,48 S425,52 450,15" fill="none" stroke="#b8f36b" strokeWidth="3" /></svg></div><div className="chart-labels"><span>Lun</span><span>Mar</span><span>Mié</span><span>Jue</span><span>Vie</span><span>Sáb</span><span>Dom</span></div></div><div className="activity-card"><div className="panel-title"><b>Actividad reciente</b><span>Ver todo</span></div><div className="activity-row"><i className="activity-icon lime">$</i><div><b>Nueva venta registrada</b><small>Hace 8 minutos</small></div><strong>+C$420.00</strong></div><div className="activity-row"><i className="activity-icon blue">□</i><div><b>Preventa lista para cobrar</b><small>Hace 24 minutos</small></div><strong>#PV-2481</strong></div><div className="activity-row"><i className="activity-icon purple">+</i><div><b>Nuevo cliente agregado</b><small>Hace 1 hora</small></div><strong>María López</strong></div></div></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="trusted page-container"><span>DISEÑADO PARA NEGOCIOS QUE QUIEREN AVANZAR</span><div><b>comercio</b><b>distribución</b><b>servicios</b><b>retail</b><b>operaciones</b></div></section>

      <section className="section page-container" id="modulos"><div className="section-heading"><div><div className="eyebrow">Todo lo que necesitas</div><h2>Menos herramientas.<br /><em>Más claridad.</em></h2></div><p>Una plataforma flexible para cada parte de tu operación. Activa lo que necesitas hoy y crece sin cambiar de sistema mañana.</p></div><div className="module-grid">{modules.map((module) => <article className="module-card" key={module.number}><span className="module-number">{module.number}</span><h3>{module.title}</h3><p>{module.text}</p><span className="module-arrow">↗</span></article>)}</div></section>

      <section className="dark-band" id="como-funciona"><div className="page-container steps-section"><div className="eyebrow light">Empieza en minutos</div><h2>De la idea a la operación.<br /><em>Sin complicaciones.</em></h2><div className="steps-grid"><div className="step"><span>01</span><h3>Crea tu espacio</h3><p>Registra tu empresa y configura la base de tu operación sin depender de hojas dispersas.</p></div><div className="step"><span>02</span><h3>Organiza tu equipo</h3><p>Invita colaboradores y asigna permisos según cada responsabilidad.</p></div><div className="step"><span>03</span><h3>Opera con claridad</h3><p>Registra ventas, controla existencias, gestiona crédito y toma decisiones con métricas.</p></div></div></div></section>

      <section className="section page-container" id="precios"><div className="section-heading pricing-heading"><div><div className="eyebrow">Planes simples</div><h2>Elige tu ritmo.<br /><em>Crece a tu manera.</em></h2></div><p>Comienza con lo esencial. Cambia de plan cuando tu operación lo necesite, sin contratos complicados.</p></div><div className="pricing-grid">{plans.map((plan) => <article className={`pricing-card ${plan.featured ? 'featured' : ''}`} key={plan.name}>{plan.featured && <div className="popular-label">Más elegido</div>}<h3>{plan.name}</h3><p>{plan.description}</p><div className="price"><strong>${plan.price}</strong><span>/ mes</span></div><button className={`button ${plan.featured ? 'button-lime' : 'button-outline'}`} onClick={() => onNavigate('register')}>Comenzar ahora <Arrow /></button><ul>{plan.features.map((feature) => <li key={feature}><span>✓</span>{feature}</li>)}</ul></article>)}</div></section>

      <section className="cta-section page-container"><div className="cta-inner"><div><div className="eyebrow">Tu próximo capítulo comienza aquí</div><h2>Haz que tu negocio<br /><em>se mueva mejor.</em></h2></div><button className="button button-large button-dark" onClick={() => onNavigate('register')}>Crear mi empresa <Arrow /></button></div></section>
      <footer className="footer page-container"><Logo /><span>© 2026 ConexiaX. Operaciones claras para negocios ambiciosos.</span><div><a href="#modulos">Módulos</a><a href="#precios">Precios</a><a href="/privacy">Privacidad</a></div></footer>
    </main>
  );
}

function AuthCard({ mode, onNavigate }: { mode: 'login' | 'register'; onNavigate: (view: View) => void }) {
  const isRegister = mode === 'register';
  const [company, setCompany] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [website, setWebsite] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [mfaChallenge, setMfaChallenge] = useState<MfaChallenge | null>(null);
  const [mfaCode, setMfaCode] = useState('');

  async function resetPassword() {
    if (!email.trim()) {
      setMessage('Escribe tu correo para enviarte un enlace de recuperación.');
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      await requestPasswordRecovery(email);
      setMessage('Te enviamos un enlace para restablecer tu contraseña. Revisa también la carpeta de spam.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo enviar el enlace de recuperación.');
    } finally {
      setLoading(false);
    }
  }

  async function finishMfa() {
    if (!mfaChallenge) return;
    setLoading(true);
    setMessage('');
    try {
      await completeMfaSignIn(mfaChallenge.resolver, mfaChallenge.verificationId, mfaCode);
      mfaChallenge.verifier.clear();
      setMfaChallenge(null);
      window.location.href = '/onboarding';
    } catch (error) {
      setMessage(error instanceof Error && error.message === 'CODE_FORMAT' ? 'El código MFA debe tener seis dígitos.' : 'No se pudo verificar el segundo factor.');
    } finally { setLoading(false); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    setLoading(true);
    try {
      if (isRegister) {
        const response = await fetch('/api/tenants', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: company, ownerName: name, email, password, website }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'No se pudo crear la empresa.');
        const createdUser = await signInWithEmailAndPassword(auth, email.trim(), password);
        await sendVerification(createdUser.user);
        await signOut(auth);
        setMessage('Cuenta creada. Revisa tu correo y confirma la dirección antes de entrar al espacio de trabajo.');
      } else {
        const attemptResponse = await fetch('/api/auth/login-attempt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        if (!attemptResponse.ok) {
          const attemptData = await attemptResponse.json().catch(() => ({}));
          throw new Error(attemptData.error || 'Demasiados intentos. Intenta de nuevo más tarde.');
        }
        try {
          await loginWithFirebase(email.trim(), password);
        } catch (error) {
          if (error instanceof Error && error.message === 'auth/multi-factor-auth-required') {
            setMfaChallenge(await beginMfaSignIn(error, 'mfa-login-recaptcha'));
            setMessage('Te enviamos un código al segundo factor inscrito.');
            return;
          }
          throw error;
        }
        const signedInUser = auth.currentUser;
        if (!signedInUser?.emailVerified) {
          if (signedInUser) await sendVerification(signedInUser);
          await signOut(auth);
          throw new Error('Verifica tu correo electrónico. Te enviamos un nuevo enlace de confirmación.');
        }
        window.location.href = '/onboarding';
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Ocurrió un error.');
    } finally { setLoading(false); }
  }

  return <main className="auth-page"><div className="auth-orb orb-left" /><div className="auth-orb orb-right" /><nav className="auth-nav page-container"><button className="brand-button" onClick={() => onNavigate('home')}><Logo /></button><button className="back-link" onClick={() => onNavigate('home')}>← Volver al inicio</button></nav><div className="auth-layout page-container"><div className="auth-pitch"><div className="eyebrow">{isRegister ? 'Empieza con claridad' : 'Bienvenido de vuelta'}</div><h1>{isRegister ? <>Construye un negocio<br /><em>que avance.</em></> : <>Todo tu negocio.<br /><em>En control.</em></>}</h1><p>{isRegister ? 'Crea tu espacio de trabajo y descubre una forma más simple de operar, medir y crecer.' : 'Accede a tu espacio de trabajo y continúa donde lo dejaste.'}</p><div className="auth-benefits"><span>✦ Multiempresa desde el inicio</span><span>✦ Datos aislados y seguros</span><span>✦ Sin tarjeta de crédito</span></div></div><div className="auth-card"><div className="auth-card-top"><span className="eyebrow">{isRegister ? 'Crear espacio' : 'Acceder'}</span><h2>{isRegister ? 'Tu operación empieza aquí.' : 'Hola de nuevo.'}</h2><p>{isRegister ? 'Configura tu empresa en menos de dos minutos.' : 'Ingresa tus datos para continuar.'}</p></div><form onSubmit={mfaChallenge ? (event) => { event.preventDefault(); void finishMfa(); } : submit}>{mfaChallenge ? <><label>Código MFA<input value={mfaCode} onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="123456" inputMode="numeric" required /></label><div id="mfa-login-recaptcha" /></> : isRegister && <><label>Nombre de la empresa<input value={company} onChange={(event) => setCompany(event.target.value)} placeholder="Ej. Grupo Horizonte" required minLength={2} /></label><label>Tu nombre<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej. Carlos Sequeira" required minLength={2} /></label><input aria-hidden="true" tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} style={{ display: 'none' }} /></>}<label>Correo electrónico<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="tu@empresa.com" required /></label><label>Contraseña<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mínimo 8 caracteres" required minLength={8} /></label>{!isRegister && <div className="form-helper"><label className="checkbox-label"><input type="checkbox" /> Recordarme</label><button type="button" className="text-link" onClick={() => void resetPassword()} disabled={loading}>¿Olvidaste tu contraseña?</button></div>}{message && <div className={`form-message ${message.includes('creada') ? 'success' : ''}`}>{message}</div>}<button className="button button-large auth-submit" disabled={loading}>{loading ? 'Procesando...' : mfaChallenge ? 'Verificar MFA ↗' : isRegister ? 'Crear mi empresa ↗' : 'Iniciar sesión ↗'}</button></form><div className="auth-switch">{isRegister ? '¿Ya tienes una cuenta?' : '¿Todavía no tienes un espacio?'} <button onClick={() => onNavigate(isRegister ? 'login' : 'register')}>{isRegister ? 'Inicia sesión' : 'Crea tu empresa'}</button></div></div></div></main>;
}

export function LoginPage() {
  const router = useRouter();
  return <AuthCard mode="login" onNavigate={(view) => router.push(view === 'home' ? '/' : '/register')} />;
}

export function RegisterPage() {
  const router = useRouter();
  return <AuthCard mode="register" onNavigate={(view) => router.push(view === 'home' ? '/' : '/login')} />;
}

export default function MarketingSite() {
  const [view, setView] = useState<View>('home');
  if (view === 'home') return <Landing onNavigate={setView} />;
  return <AuthCard mode={view} onNavigate={setView} />;
}
