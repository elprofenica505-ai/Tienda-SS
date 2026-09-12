import type { FiscalDocumentType, FiscalSaleFields } from '@/lib/fiscal-ni';

export type FiscalProviderId = 'manual' | 'generic_api' | 'dgi_nicaragua' | 'custom';
export type FiscalIntegrationStatus = 'disabled' | 'configured' | 'sandbox' | 'production' | 'error';
export type FiscalEmissionStatus = 'not_requested' | 'pending' | 'submitted' | 'accepted' | 'rejected' | 'cancelled';

export type FiscalProviderDefinition = {
  id: FiscalProviderId;
  name: string;
  description: string;
  supportsSandbox: boolean;
  supportsElectronicEmission: boolean;
  credentialFields: readonly string[];
  officialApiPublished: boolean;
  requiresAuthorizedProvider: boolean;
};

export const FISCAL_PROVIDERS: readonly FiscalProviderDefinition[] = [
  { id: 'manual', name: 'Manual / sin conexión', description: 'Registra ventas y numeración interna sin enviar documentos a un proveedor.', supportsSandbox: false, supportsElectronicEmission: false, credentialFields: [], officialApiPublished: false, requiresAuthorizedProvider: false },
  { id: 'generic_api', name: 'Proveedor mediante API', description: 'Conecta un proveedor externo mediante endpoint y credenciales administradas.', supportsSandbox: true, supportsElectronicEmission: true, credentialFields: ['endpoint', 'credentialRef'], officialApiPublished: false, requiresAuthorizedProvider: true },
  { id: 'dgi_nicaragua', name: 'DGI Nicaragua mediante proveedor autorizado', description: 'Adaptador de cumplimiento para Nicaragua; requiere la interfaz técnica y credenciales entregadas por la DGI o un proveedor autorizado.', supportsSandbox: true, supportsElectronicEmission: true, credentialFields: ['endpoint', 'credentialRef', 'environment'], officialApiPublished: false, requiresAuthorizedProvider: true },
  { id: 'custom', name: 'Adaptador personalizado', description: 'Permite registrar un adaptador propio sin acoplarlo al núcleo de ventas.', supportsSandbox: true, supportsElectronicEmission: true, credentialFields: ['endpoint', 'credentialRef'], officialApiPublished: false, requiresAuthorizedProvider: true },
];

export type FiscalTenantConfig = {
  provider: FiscalProviderId;
  mode: 'manual' | 'sandbox' | 'production';
  status: FiscalIntegrationStatus;
  country: string;
  currency: string;
  invoicePrefix: string;
  nextInvoiceSequence: number;
  endpoint?: string;
  credentialRef?: string;
  documentTypes: FiscalDocumentType[];
  legalName?: string;
  taxId?: string;
  address?: string;
  email?: string;
  phone?: string;
  updatedAt?: unknown;
  updatedBy?: string;
};

export type FiscalEmissionRequest = {
  tenantId: string;
  saleId: string;
  invoiceNumber: string;
  fields: FiscalSaleFields;
  items: readonly Record<string, unknown>[];
  config: FiscalTenantConfig;
};

export type FiscalEmissionResult = {
  status: FiscalEmissionStatus;
  provider: FiscalProviderId;
  externalId?: string;
  message?: string;
  retryable?: boolean;
};

export interface FiscalAdapter {
  readonly provider: FiscalProviderId;
  emit(request: FiscalEmissionRequest): Promise<FiscalEmissionResult>;
  cancel?(externalId: string, reason: string): Promise<FiscalEmissionResult>;
}

export function fiscalProvider(id: unknown): FiscalProviderDefinition {
  return FISCAL_PROVIDERS.find((provider) => provider.id === id) || FISCAL_PROVIDERS[0];
}

export function normalizeFiscalConfig(input: Record<string, unknown>, current?: Partial<FiscalTenantConfig>): FiscalTenantConfig {
  const provider = fiscalProvider(input.provider ?? current?.provider).id;
  const mode = input.mode === 'sandbox' || input.mode === 'production' ? input.mode : (current?.mode || 'manual');
  const status: FiscalIntegrationStatus = input.status === 'configured' || input.status === 'sandbox' || input.status === 'production' || input.status === 'error' ? input.status : (mode === 'manual' ? 'disabled' : 'configured');
  const documentTypes = Array.isArray(input.documentTypes) ? input.documentTypes.filter((value): value is FiscalDocumentType => value === 'invoice' || value === 'credit_note' || value === 'debit_note') : (current?.documentTypes || ['invoice']);
  return {
    provider,
    mode,
    status,
    country: typeof input.country === 'string' ? input.country.trim().slice(0, 3).toUpperCase() : (current?.country || 'NI'),
    currency: typeof input.currency === 'string' ? input.currency.trim().slice(0, 3).toUpperCase() : (current?.currency || 'NIO'),
    invoicePrefix: typeof input.invoicePrefix === 'string' ? input.invoicePrefix.trim().slice(0, 20).replace(/[^A-Za-z0-9-]/g, '').toUpperCase() || 'FAC' : (current?.invoicePrefix || 'FAC'),
    nextInvoiceSequence: typeof input.nextInvoiceSequence === 'number' && Number.isInteger(input.nextInvoiceSequence) && input.nextInvoiceSequence > 0 ? input.nextInvoiceSequence : (current?.nextInvoiceSequence || 1),
    endpoint: typeof input.endpoint === 'string' ? input.endpoint.trim().slice(0, 500) : current?.endpoint,
    credentialRef: typeof input.credentialRef === 'string' && input.credentialRef.trim() !== 'configured' && input.credentialRef.trim() ? input.credentialRef.trim().slice(0, 180) : current?.credentialRef,
    documentTypes,
    legalName: typeof input.legalName === 'string' ? input.legalName.trim().slice(0, 180) : current?.legalName,
    taxId: typeof input.taxId === 'string' ? input.taxId.trim().slice(0, 60).toUpperCase() : current?.taxId,
    address: typeof input.address === 'string' ? input.address.trim().slice(0, 240) : current?.address,
    email: typeof input.email === 'string' ? input.email.trim().slice(0, 160).toLowerCase() : current?.email,
    phone: typeof input.phone === 'string' ? input.phone.trim().slice(0, 40) : current?.phone,
  };
}

export function validateFiscalConfig(config: FiscalTenantConfig): string | null {
  const provider = fiscalProvider(config.provider);
  if (!config.legalName) return 'La razón social de la empresa es obligatoria.';
  if (!config.taxId) return 'El RUC o identificador fiscal de la empresa es obligatorio.';
  if (config.mode !== 'manual' && !provider.supportsElectronicEmission) return 'El proveedor seleccionado no admite emisión electrónica.';
  if (config.mode !== 'manual' && !config.endpoint) return 'El endpoint del proveedor es obligatorio fuera del modo manual.';
  if (config.mode !== 'manual' && !config.credentialRef) return 'La referencia segura de credenciales es obligatoria fuera del modo manual.';
  if (config.mode === 'production' && config.status !== 'production') return 'La configuración de producción debe marcarse explícitamente como producción.';
  return null;
}

export function fiscalConfigForStorage(config: FiscalTenantConfig): Record<string, unknown> {
  return Object.fromEntries(Object.entries(config).filter(([, value]) => value !== undefined));
}

export function createManualAdapter(): FiscalAdapter {
  return { provider: 'manual', async emit() { return { provider: 'manual', status: 'accepted', message: 'Registro interno; no se envió a un proveedor externo.' }; } };
}

export function getFiscalAdapter(provider: FiscalProviderId): FiscalAdapter {
  // Los adaptadores externos se conectarán aquí; no se realizan llamadas sin configuración explícita.
  return createManualAdapter().provider === provider ? createManualAdapter() : {
    provider,
    async emit() { return { provider, status: 'pending', message: 'Adaptador registrado; falta implementar la conexión del proveedor.', retryable: false }; },
  };
}
