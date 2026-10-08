'use client';

import { FormEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useTenant } from '@/components/tenant/TenantProvider';
import { WorkspaceSidebar } from '@/components/workspace/WorkspaceSidebar';

const MANAGER_ROLES = new Set(['owner', 'admin', 'gerente', 'jefe']);
const NO_API_KEY_MESSAGE = 'No hay API Key configurada. Agrega tu propia key en Configuración IA o configura GEMINI_API_KEY en Vercel.';

const suggestions = [
  '¿Cuánto vendí hoy?',
  '¿Cómo va la sucursal principal?',
  '¿Qué productos debo reponer?',
  '¿Cuál es mi flujo neto?',
];

type Message = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt?: string;
  error?: boolean;
};

type Quota = {
  used: number;
  limit: number | null;
  remaining: number | null;
  localDate?: string;
  resetAt?: string;
  timezone: string;
  unlimited: boolean;
};

type AiConfig = {
  provider: 'gemini';
  personality: 'conexia' | 'financial' | 'sales' | 'inventory' | 'custom';
  dailyLimit: number;
  enabled: boolean;
  customInstructions: string;
  hasApiKey: boolean;
  maskedKey: string | null;
  keyReadable: boolean;
  usingOwnKey: boolean;
  encryptionConfigured: boolean;
  hasSystemApiKey: boolean;
};

type ConfigDraft = {
  personality: AiConfig['personality'];
  dailyLimit: number;
  enabled: boolean;
  customInstructions: string;
};

const personalityOptions: Array<{ value: ConfigDraft['personality']; label: string; detail: string }> = [
  { value: 'conexia', label: 'Conexia', detail: 'Equilibrado entre finanzas, ventas e inventario.' },
  { value: 'financial', label: 'Experto Financiero', detail: 'Flujo de caja, gastos, cobros y decisiones de rentabilidad.' },
  { value: 'sales', label: 'Experto Ventas', detail: 'Oportunidades comerciales, sucursales y crecimiento de ventas.' },
  { value: 'inventory', label: 'Experto Inventario', detail: 'Reposición, stock bajo y rotación de productos.' },
  { value: 'custom', label: 'Personalizado', detail: 'Usa las instrucciones que definas para tu empresa.' },
];

function defaultDraft(): ConfigDraft {
  return { personality: 'conexia', dailyLimit: 20, enabled: true, customInstructions: '' };
}

function quotaLabel(quota: Quota | null) {
  if (!quota) return 'Cargando cuota…';
  if (quota.unlimited) return 'Tu API Key · Sin límite';
  return `${quota.remaining ?? 0} de ${quota.limit ?? 20} consultas`;
}

function footerQuota(quota: Quota | null) {
  if (!quota) return 'Estamos consultando tu cuota de hoy…';
  if (quota.unlimited) return 'Tu API Key propia no consume la cuota gratuita de ConexiaX.';
  return `Te quedan ${quota.remaining ?? 0} consultas hoy`;
}

function AssistantPageContent() {
  const { authUser, tenant, member, loading: tenantLoading } = useTenant();
  const [messages, setMessages] = useState<Message[]>([]);
  const [config, setConfig] = useState<AiConfig | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [loading, setLoading] = useState(true);
  const [typing, setTyping] = useState(false);
  const [input, setInput] = useState('');
  const [notice, setNotice] = useState('');
  const [online, setOnline] = useState(true);
  const [configOpen, setConfigOpen] = useState(false);
  const [draft, setDraft] = useState<ConfigDraft>(defaultDraft);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiKeyTouched, setApiKeyTouched] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [clearingHistory, setClearingHistory] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const isManager = Boolean(member && MANAGER_ROLES.has(member.role));

  const load = useCallback(async () => {
    if (!authUser || !tenant || !isManager) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const token = await authUser.getIdToken();
      const headers = { Authorization: `Bearer ${token}`, 'x-tenant-id': tenant.id };
      const [configResponse, historyResponse] = await Promise.all([
        fetch('/api/ai/config', { headers, cache: 'no-store' }),
        fetch('/api/ai/history', { headers, cache: 'no-store' }),
      ]);
      const configData = await configResponse.json().catch(() => ({}));
      const historyData = await historyResponse.json().catch(() => ({}));
      if (!configResponse.ok) throw new Error(configData.error || 'No se pudo cargar la configuración de Conexia.');
      if (!historyResponse.ok) throw new Error(historyData.error || 'No se pudo cargar el historial de Conexia.');
      setConfig(configData.config as AiConfig);
      setQuota(configData.quota as Quota);
      setMessages(Array.isArray(historyData.history) ? historyData.history as Message[] : []);
      setNotice('');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo cargar Conexia.');
    } finally {
      setLoading(false);
    }
  }, [authUser, tenant, isManager]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const sync = () => setOnline(typeof navigator === 'undefined' || navigator.onLine !== false);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: typing ? 'smooth' : 'auto', block: 'end' });
  }, [messages, typing]);

  function openConfig() {
    if (config) {
      setDraft({
        personality: config.personality,
        dailyLimit: config.dailyLimit,
        enabled: config.enabled,
        customInstructions: config.customInstructions,
      });
      setApiKeyInput(config.maskedKey || '');
    } else {
      setDraft(defaultDraft());
      setApiKeyInput('');
    }
    setApiKeyTouched(false);
    setNotice('');
    setConfigOpen(true);
  }

  async function sendQuestion(event?: FormEvent) {
    event?.preventDefault();
    const question = input.trim();
    if (!question || typing || !authUser || !tenant) return;
    if (!online) {
      setNotice('Estás sin conexión. Vuelve a conectarte para consultar a Conexia.');
      return;
    }

    const temporaryId = `local-user-${Date.now()}`;
    setMessages((current) => [...current, { id: temporaryId, role: 'user', content: question, createdAt: new Date().toISOString() }]);
    setInput('');
    setTyping(true);
    setNotice('');
    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await authUser.getIdToken()}`,
          'x-tenant-id': tenant.id,
        },
        body: JSON.stringify({ message: question }),
      });
      const data = await response.json().catch(() => ({}));
      if (data.quota) setQuota(data.quota as Quota);
      if (!response.ok) {
        const error = data.error || 'Conexia no pudo responder en este momento.';
        setNotice(error);
        setMessages((current) => [...current, { id: `local-error-${Date.now()}`, role: 'assistant', content: error, error: true, createdAt: new Date().toISOString() }]);
        return;
      }
      setMessages((current) => [...current, {
        id: data.assistant?.id || `local-assistant-${Date.now()}`,
        role: 'assistant',
        content: typeof data.response === 'string' ? data.response : 'Conexia no recibió una respuesta utilizable.',
        createdAt: data.assistant?.createdAt,
      }]);
      if (typeof data.usingOwnKey === 'boolean' && config) setConfig({ ...config, usingOwnKey: data.usingOwnKey });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo conectar con Conexia.';
      setNotice(message);
      setMessages((current) => [...current, { id: `local-network-${Date.now()}`, role: 'assistant', content: message, error: true, createdAt: new Date().toISOString() }]);
    } finally {
      setTyping(false);
    }
  }

  function onInputKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendQuestion();
    }
  }

  async function saveConfig(event: FormEvent) {
    event.preventDefault();
    if (!authUser || !tenant) return;
    setSavingConfig(true);
    setNotice('');
    try {
      const response = await fetch('/api/ai/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await authUser.getIdToken()}`,
          'x-tenant-id': tenant.id,
        },
        body: JSON.stringify({
          personality: draft.personality,
          daily_limit: Number(draft.dailyLimit),
          custom_instructions: draft.customInstructions,
          enabled: draft.enabled,
          // A masked value tells the server to preserve the existing cipher.
          api_key: apiKeyTouched ? apiKeyInput : (config?.maskedKey || ''),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'No se pudo guardar la configuración.');
      setConfig(data.config as AiConfig);
      setQuota(data.quota as Quota);
      setConfigOpen(false);
      setNotice('Configuración IA guardada.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo guardar la configuración.');
    } finally {
      setSavingConfig(false);
    }
  }

  async function clearHistory() {
    if (!authUser || !tenant || clearingHistory) return;
    if (!window.confirm('¿Borrar todas las conversaciones de Conexia para esta empresa?')) return;
    setClearingHistory(true);
    try {
      const response = await fetch('/api/ai/history', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${await authUser.getIdToken()}`, 'x-tenant-id': tenant.id },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'No se pudo borrar el historial.');
      setMessages([]);
      setNotice('Historial de Conexia borrado.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo borrar el historial.');
    } finally {
      setClearingHistory(false);
    }
  }

  if (tenantLoading || loading) return <div className="workspace-loading">Preparando a Conexia…</div>;

  if (!authUser || !tenant || !member) {
    return <div className="workspace-loading">Necesitas iniciar sesión para abrir Conexia.</div>;
  }

  if (!isManager) {
    return (
      <main className="workspace-page">
        <WorkspaceSidebar />
        <section className="workspace-main assistant-main">
          <div className="assistant-restricted" role="alert">
            <div className="assistant-avatar assistant-avatar-large" aria-hidden="true">C</div>
            <div className="eyebrow">Conexia IA</div>
            <h1>Acceso restringido, solo dueño</h1>
            <p>Conexia consulta ventas, inventario, finanzas y sucursales de la empresa. Pide al dueño o a un administrador que ingrese a este módulo.</p>
          </div>
        </section>
      </main>
    );
  }

  const canUseOwnKey = Boolean(config?.enabled && config?.hasApiKey && config?.keyReadable);
  const hasAnyUsableKey = Boolean(config?.hasSystemApiKey || canUseOwnKey);
  const quotaExhausted = Boolean(!quota?.unlimited && quota?.remaining !== null && quota && quota.remaining <= 0);

  return (
    <main className="workspace-page">
      <WorkspaceSidebar />
      <section className="workspace-main assistant-main">
        <header className="assistant-header">
          <div className="assistant-heading">
            <div className="assistant-avatar" aria-hidden="true">C</div>
            <div>
              <div className="eyebrow">Inteligencia / ConexiaX</div>
              <h1>Conexia IA</h1>
              <p>Tu experta financiera y de negocio, conectada a los datos reales de <strong>{tenant.name}</strong>.</p>
            </div>
          </div>
          <div className="assistant-header-actions">
            <span className={`assistant-quota-badge${quota?.unlimited ? ' own-key' : ''}`} aria-label={quotaLabel(quota)}>{quotaLabel(quota)}</span>
            <button className="button button-secondary assistant-config-button" type="button" onClick={openConfig}>⚙ Configuración IA</button>
          </div>
        </header>

        {!online && <div className="assistant-offline-banner" role="status"><span aria-hidden="true">◌</span><div><b>Estás sin conexión</b><small>Conexia volverá a estar disponible cuando recuperes internet.</small></div></div>}
        {notice && <div className="assistant-notice" role="status">{notice}</div>}
        {!hasAnyUsableKey && <div className="assistant-key-banner" role="alert"><div><b>No hay API Key configurada</b><span>{NO_API_KEY_MESSAGE}</span></div><button className="button button-secondary" type="button" onClick={openConfig}>Configurar IA</button></div>}
        {quotaExhausted && !canUseOwnKey && <div className="assistant-key-banner quota-reached" role="status"><div><b>Cuota gratuita agotada</b><span>Agrega tu propia API Key en Configuración IA para consultas ilimitadas en ConexiaX.</span></div><button className="button button-secondary" type="button" onClick={openConfig}>Agregar API Key</button></div>}

        <section className="assistant-chat-panel" aria-label="Conversación con Conexia">
          <div className="assistant-messages">
            {messages.length === 0 ? (
              <div className="assistant-empty-state">
                <div className="assistant-avatar assistant-avatar-large" aria-hidden="true">C</div>
                <h2>Hola, soy Conexia</h2>
                <p>Estoy lista para analizar las ventas, el stock, las finanzas y las sucursales de <strong>{tenant.name}</strong> con los datos registrados en ConexiaX.</p>
                <div className="assistant-suggestions" aria-label="Consultas sugeridas">
                  {suggestions.map((suggestion) => <button type="button" key={suggestion} onClick={() => setInput(suggestion)}>{suggestion}</button>)}
                </div>
              </div>
            ) : messages.map((message) => (
              <div className={`assistant-message assistant-message-${message.role}${message.error ? ' is-error' : ''}`} key={message.id}>
                {message.role === 'assistant' && <div className="assistant-avatar assistant-message-avatar" aria-hidden="true">C</div>}
                <article className="assistant-bubble">
                  <small>{message.role === 'user' ? 'Tú' : 'Conexia'}</small>
                  <p>{message.content}</p>
                </article>
                {message.role === 'user' && <div className="assistant-user-avatar" aria-hidden="true">Tú</div>}
              </div>
            ))}
            {typing && <div className="assistant-message assistant-message-assistant"><div className="assistant-avatar assistant-message-avatar" aria-hidden="true">C</div><div className="assistant-typing" aria-label="Conexia está escribiendo"><i /><i /><i /></div></div>}
            <div ref={chatEndRef} />
          </div>

          <form className="assistant-composer" onSubmit={sendQuestion}>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value.slice(0, 2000))}
              onKeyDown={onInputKeyDown}
              placeholder="Pregúntale a Conexia sobre tu negocio…"
              aria-label="Consulta para Conexia"
              disabled={typing || !online}
              rows={2}
            />
            <button className="button assistant-send" type="submit" disabled={!input.trim() || typing || !online} aria-label="Enviar consulta a Conexia">↑</button>
          </form>
          <footer className="assistant-footer-hint"><span>{footerQuota(quota)}</span><span>Enter para enviar · Shift + Enter para una nueva línea</span></footer>
        </section>
      </section>

      {configOpen && (
        <div className="assistant-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !savingConfig) setConfigOpen(false); }}>
          <section className="assistant-config-modal" role="dialog" aria-modal="true" aria-labelledby="assistant-config-title">
            <header>
              <div><div className="eyebrow">Conexia IA</div><h2 id="assistant-config-title">Configuración IA</h2><p>Personaliza cómo piensa Conexia y conecta tu propia API Key si lo deseas.</p></div>
              <button className="assistant-modal-close" type="button" onClick={() => setConfigOpen(false)} disabled={savingConfig} aria-label="Cerrar configuración">×</button>
            </header>
            <form onSubmit={saveConfig} className="assistant-config-form">
              <fieldset>
                <legend>Personalidad</legend>
                <div className="assistant-personality-grid">
                  {personalityOptions.map((option) => <label className={draft.personality === option.value ? 'selected' : ''} key={option.value}><input type="radio" name="personality" value={option.value} checked={draft.personality === option.value} onChange={() => setDraft({ ...draft, personality: option.value })} /><span><b>{option.label}</b><small>{option.detail}</small></span></label>)}
                </div>
              </fieldset>

              <label className="assistant-config-label">Límite diario gratuito
                <span>De 1 a 100 consultas al día cuando uses la API Key compartida de ConexiaX.</span>
                <input type="number" min="1" max="100" value={draft.dailyLimit} onChange={(event) => setDraft({ ...draft, dailyLimit: Number(event.target.value) })} />
              </label>

              <label className="assistant-config-label">Instrucciones personalizadas <small>Opcional · hasta 2000 caracteres</small>
                <textarea value={draft.customInstructions} maxLength={2000} onChange={(event) => setDraft({ ...draft, customInstructions: event.target.value })} placeholder="Ej. Prioriza recomendaciones para ventas al por mayor y pagos a proveedores." rows={4} />
              </label>

              <section className="assistant-byok-section">
                <div className="assistant-byok-heading"><div><div className="eyebrow">Tu propia API Key (BYOK)</div><h3>Gemini para tu empresa</h3><p>{config?.hasApiKey ? `Key configurada: ${config.maskedKey || '••••'}` : 'No has configurado una API Key propia todavía.'}</p></div><label className="assistant-enabled-toggle"><input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} /><span>Usar mi key</span></label></div>
                <label className="assistant-config-label">API Key de Gemini
                  <input type="password" autoComplete="off" value={apiKeyInput} onChange={(event) => { setApiKeyTouched(true); setApiKeyInput(event.target.value); }} placeholder={config?.maskedKey || 'Pega una nueva API Key'} />
                  <small>Deja el valor enmascarado para conservarla. Borra el campo y guarda para eliminarla.</small>
                </label>
                <div className="assistant-ai-studio-help">
                  <a className="button button-secondary" href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer noopener">Abrir Google AI Studio ↗</a>
                  <ol><li>Click en <strong>Create API Key</strong>.</li><li>Copiar.</li><li>Pegar aquí y guardar.</li></ol>
                  <p>Todo se queda en tu empresa, encriptado. Puedes generar tantas keys como correos tengas, gratis.</p>
                  <small>Para un plan de pago, usa una key con facturación en GCP (Google Cloud): consultas ilimitadas en ConexiaX al usar tu propia key.</small>
                </div>
              </section>

              <div className="assistant-config-actions">
                <button className="text-link" type="button" onClick={() => void clearHistory()} disabled={clearingHistory || savingConfig}>{clearingHistory ? 'Borrando historial…' : 'Borrar historial'}</button>
                <div><button className="button button-secondary" type="button" onClick={() => setConfigOpen(false)} disabled={savingConfig}>Cancelar</button><button className="button" type="submit" disabled={savingConfig}>{savingConfig ? 'Guardando…' : 'Guardar configuración'}</button></div>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}

export default function AssistantPage() {
  return <AssistantPageContent />;
}
