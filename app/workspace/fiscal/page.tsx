'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TenantProvider, useTenant } from '@/components/tenant/TenantProvider';
import { WorkspaceSidebar } from '@/components/workspace/WorkspaceSidebar';

type Provider = { id: string; name: string; description: string; supportsSandbox: boolean; supportsElectronicEmission: boolean; credentialFields: string[]; officialApiPublished: boolean; requiresAuthorizedProvider: boolean };
type FiscalConfig = { provider: string; mode: 'manual' | 'sandbox' | 'production'; status: string; country: string; currency: string; invoicePrefix: string; nextInvoiceSequence: number; endpoint?: string; credentialRef?: string; documentTypes: string[]; legalName?: string; taxId?: string; address?: string; email?: string; phone?: string };
const initialConfig: FiscalConfig = { provider: 'manual', mode: 'manual', status: 'disabled', country: 'NI', currency: 'NIO', invoicePrefix: 'FAC', nextInvoiceSequence: 1, documentTypes: ['invoice'] };

function FiscalContent() {
  const router = useRouter();
  const { authUser, tenant, member, loading: tenantLoading } = useTenant();
  const [config, setConfig] = useState<FiscalConfig>(initialConfig);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const canEdit = member && ['owner', 'admin', 'gerente'].includes(member.role);
  const selectedProvider = providers.find((provider) => provider.id === config.provider);
  const update = (changes: Partial<FiscalConfig>) => setConfig((current) => ({ ...current, ...changes }));

  const load = useCallback(async () => {
    if (!authUser || !tenant) return;
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/fiscal/config', { headers: { Authorization: `Bearer ${await authUser.getIdToken()}`, 'x-tenant-id': tenant.id }, cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo cargar la configuración fiscal.');
      setConfig({ ...initialConfig, ...(data.config || {}) }); setProviders(data.providers || []);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo cargar la configuración fiscal.'); }
    finally { setLoading(false); }
  }, [authUser, tenant]);
  useEffect(() => { void load(); }, [load]);

  async function save(event: FormEvent) {
    event.preventDefault(); if (!authUser || !tenant || !canEdit) return;
    setSaving(true); setMessage(''); setError('');
    try {
      const payload = { ...config, status: config.mode === 'production' ? 'production' : config.mode === 'sandbox' ? 'sandbox' : 'disabled' };
      const response = await fetch('/api/fiscal/config', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await authUser.getIdToken()}`, 'x-tenant-id': tenant.id }, body: JSON.stringify(payload) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'No se pudo guardar la configuración.');
      setConfig({ ...config, ...data.config }); setMessage('Configuración fiscal guardada correctamente.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo guardar la configuración fiscal.'); }
    finally { setSaving(false); }
  }

  if (tenantLoading || loading) return <div className="workspace-loading">Cargando configuración fiscal...</div>;
  if (!authUser || !tenant || !member) { router.replace('/'); return null; }
  return <main className="workspace-page"><WorkspaceSidebar /><section className="workspace-main members-main"><header className="members-header"><div><button className="text-link" onClick={() => router.push('/workspace')}>← Resumen</button><div className="eyebrow catalog-eyebrow">Tu espacio / Configuración</div><h1>Facturación fiscal</h1><p>Configura cómo <strong>{tenant.name}</strong> identifica y conecta sus documentos fiscales.</p></div><span className={`member-status ${config.mode === 'production' ? 'active' : 'disabled'}`}>{config.mode === 'manual' ? 'Modo manual' : config.mode === 'sandbox' ? 'Sandbox' : 'Producción'}</span></header>{message && <div className="catalog-message" role="status">{message}</div>}{error && <div className="catalog-message catalog-isolation is-warning" role="alert">{error}</div>}{!canEdit && <div className="catalog-message catalog-isolation is-warning">Solo un propietario, administrador o gerente puede cambiar esta configuración.</div>}<form onSubmit={save} className="fiscal-settings-form"><section className="section-card"><div className="eyebrow">01 · Proveedor y ambiente</div><h2>Elige cómo facturar</h2><p>El modo manual no realiza envíos externos. Sandbox y producción requieren una conexión autorizada.</p><div className="provider-grid">{providers.map((provider) => <button type="button" key={provider.id} className={`provider-choice ${config.provider === provider.id ? 'selected' : ''}`} onClick={() => update({ provider: provider.id, mode: provider.id === 'manual' ? 'manual' : config.mode === 'manual' ? 'sandbox' : config.mode })}><span className="provider-radio">{config.provider === provider.id ? '✓' : ''}</span><span><b>{provider.name}</b><small>{provider.description}</small>{provider.id === 'dgi_nicaragua' && <em>Requiere interfaz de la DGI o proveedor autorizado</em>}</span></button>)}</div><div className="fiscal-mode-row"><label>Modo de operación<select disabled={!canEdit} value={config.mode} onChange={(event) => update({ mode: event.target.value as FiscalConfig['mode'] })}><option value="manual">Manual / sin conexión</option><option value="sandbox" disabled={!selectedProvider?.supportsSandbox}>Sandbox / pruebas</option><option value="production" disabled={!selectedProvider?.supportsElectronicEmission}>Producción / emisión real</option></select></label><div className="fiscal-status-box"><small>Estado del adaptador</small><b>{selectedProvider?.officialApiPublished ? 'API oficial publicada' : 'Requiere documentación técnica del proveedor'}</b></div></div></section><section className="section-card"><div className="eyebrow">02 · Datos del emisor</div><h2>Identidad fiscal de la empresa</h2><p>Estos datos se usarán para preparar los documentos. La empresa debe verificar que coincidan con su registro fiscal.</p><div className="fiscal-form-grid"><label>Razón social<input disabled={!canEdit} required={config.mode !== 'manual'} value={config.legalName || ''} onChange={(event) => update({ legalName: event.target.value })} placeholder="Nombre legal de la empresa" /></label><label>RUC / identificador fiscal<input disabled={!canEdit} value={config.taxId || ''} onChange={(event) => update({ taxId: event.target.value })} placeholder="RUC de la empresa" /></label><label>Correo fiscal<input disabled={!canEdit} type="email" value={config.email || ''} onChange={(event) => update({ email: event.target.value })} placeholder="facturacion@empresa.com" /></label><label>Teléfono<input disabled={!canEdit} value={config.phone || ''} onChange={(event) => update({ phone: event.target.value })} placeholder="+505 ..." /></label><label className="fiscal-wide">Dirección fiscal<textarea disabled={!canEdit} value={config.address || ''} onChange={(event) => update({ address: event.target.value })} placeholder="Dirección registrada ante la autoridad fiscal" /></label></div></section><section className="section-card"><div className="eyebrow">03 · Conexión y numeración</div><h2>Endpoint y seguridad</h2><p>No introduzcas contraseñas o certificados aquí. Guarda una referencia a la credencial protegida del servidor.</p><div className="fiscal-form-grid"><label>Endpoint del proveedor<input disabled={!canEdit || config.mode === 'manual'} type="url" value={config.endpoint || ''} onChange={(event) => update({ endpoint: event.target.value })} placeholder="https://proveedor-autorizado.example/api" /></label><label>Referencia segura de credenciales<input disabled={!canEdit || config.mode === 'manual'} value={config.credentialRef && config.credentialRef !== 'configured' ? config.credentialRef : ''} onChange={(event) => update({ credentialRef: event.target.value })} placeholder="secret/fiscal/empresa" /><small className="role-helper">Se guardará como referencia; el secreto nunca se muestra en la aplicación.</small></label><label>País<input disabled={!canEdit} value={config.country} onChange={(event) => update({ country: event.target.value.toUpperCase() })} maxLength={3} /></label><label>Moneda<input disabled={!canEdit} value={config.currency} onChange={(event) => update({ currency: event.target.value.toUpperCase() })} maxLength={3} /></label><label>Prefijo de factura<input disabled={!canEdit} value={config.invoicePrefix} onChange={(event) => update({ invoicePrefix: event.target.value.toUpperCase() })} maxLength={20} /></label><label>Próximo consecutivo<input disabled={!canEdit} type="number" min="1" value={config.nextInvoiceSequence} onChange={(event) => update({ nextInvoiceSequence: Number(event.target.value) })} /></label></div><div className="fiscal-documents"><b>Documentos permitidos</b><label><input disabled={!canEdit} type="checkbox" checked={config.documentTypes.includes('invoice')} onChange={(event) => update({ documentTypes: event.target.checked ? (config.documentTypes.includes('invoice') ? config.documentTypes : [...config.documentTypes, 'invoice']) : config.documentTypes.filter((item) => item !== 'invoice') })} /> Facturas</label><label><input disabled={!canEdit} type="checkbox" checked={config.documentTypes.includes('credit_note')} onChange={(event) => update({ documentTypes: event.target.checked ? (config.documentTypes.includes('credit_note') ? config.documentTypes : [...config.documentTypes, 'credit_note']) : config.documentTypes.filter((item) => item !== 'credit_note') })} /> Notas de crédito</label><label><input disabled={!canEdit} type="checkbox" checked={config.documentTypes.includes('debit_note')} onChange={(event) => update({ documentTypes: event.target.checked ? (config.documentTypes.includes('debit_note') ? config.documentTypes : [...config.documentTypes, 'debit_note']) : config.documentTypes.filter((item) => item !== 'debit_note') })} /> Notas de débito</label></div></section><div className="fiscal-save-bar"><span>{selectedProvider?.requiresAuthorizedProvider ? 'Verifica la autorización del proveedor antes de usar producción.' : 'La configuración manual no realiza envíos externos.'}</span><button className="button" disabled={!canEdit || saving}>{saving ? 'Guardando...' : 'Guardar configuración ↗'}</button></div></form></section></main>;
}

export default function FiscalPage() { return <TenantProvider><FiscalContent /></TenantProvider>; }
