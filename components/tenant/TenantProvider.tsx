'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { getSupabaseAccessToken } from '@/lib/supabase/auth';

export type TenantRole =
  | 'owner' | 'admin' | 'gerente' | 'supervisor_sucursal' | 'vendedor' | 'cajero'
  | 'bodega' | 'compras' | 'chofer' | 'despachador' | 'solo_lectura' | 'jefe';

export type Tenant = {
  id: string; name: string; plan?: string; status?: string; currency?: string;
  currencySymbol?: string; locale?: string; onboardingCompleted?: boolean;
};

export type TenantMember = {
  uid: string; tenantId: string; name?: string; email?: string; role: TenantRole;
  status: string; branchIds?: string[];
};

export type TenantBranch = { id: string; name: string; code: string; active: boolean; timezone?: string };

export type TenantOrganization = {
  branches: TenantBranch[];
  warehouses: Array<{ id: string; branchId: string; name: string; code: string; active: boolean; type?: string }>;
  cashRegisters: Array<{ id: string; branchId: string; name: string; code: string; active: boolean }>;
  members: Array<{ uid: string; name?: string; email?: string; role?: string; branchIds?: string[]; status?: string }>;
};

type TenantContextValue = {
  authUser: TenantAuthUser | null;
  tenant: Tenant | null;
  member: TenantMember | null;
  organization: TenantOrganization | null;
  activeBranchId: string | null;
  setActiveBranchId: (branchId: string) => void;
  loading: boolean;
  error: string;
  refresh: (options?: { force?: boolean }) => Promise<void>;
};

export type TenantAuthUser = User & { uid: string; displayName?: string; getIdToken: () => Promise<string> };

function adaptAuthUser(user: User | null): TenantAuthUser | null {
  if (!user) return null;
  return Object.assign(user, {
    uid: user.id,
    displayName: user.user_metadata?.display_name || user.user_metadata?.full_name || undefined,
    getIdToken: async () => {
      const token = await getSupabaseAccessToken();
      if (!token) throw new Error('SESSION_EXPIRED');
      return token;
    },
  });
}

const TenantContext = createContext<TenantContextValue | null>(null);
const STORAGE_KEY = 'ConexiaX.activeTenantId';
const BRANCH_STORAGE_PREFIX = 'ConexiaX.activeBranchId:';
const ADMIN_ROLES = new Set<TenantRole>(['owner', 'admin', 'gerente', 'jefe']);
let contextCache: { userId: string; tenantId: string; expiresAt: number; tenant: Tenant; member: TenantMember; organization: TenantOrganization; branchId: string | null } | null = null;
let refreshInFlight: Promise<void> | null = null;

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const [authUser, setAuthUser] = useState<TenantAuthUser | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [member, setMember] = useState<TenantMember | null>(null);
  const [organization, setOrganization] = useState<TenantOrganization | null>(null);
  const [activeBranchId, setActiveBranchIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const setActiveBranchId = useCallback((branchId: string) => {
    if (!tenant || !organization?.branches.some((branch) => branch.id === branchId)) return;
    window.localStorage.setItem(`${BRANCH_STORAGE_PREFIX}${tenant.id}`, branchId);
    setActiveBranchIdState(branchId);
  }, [tenant, organization]);

  const refresh = useCallback(async (options?: { force?: boolean }) => {
    if (refreshInFlight && !options?.force) return refreshInFlight;
    const run = (async () => {
    const sessionResult = await getSupabaseBrowser().auth.getSession();
    const session = sessionResult.data.session;
    if (!session) {
      contextCache = null;
      setTenant(null); setMember(null); setOrganization(null); setActiveBranchIdState(null); setLoading(false); return;
    }
    const requestedTenantId = window.localStorage.getItem(STORAGE_KEY);
    if (!options?.force && contextCache && contextCache.userId === session.user.id && contextCache.tenantId === requestedTenantId && contextCache.expiresAt > Date.now()) {
      setTenant(contextCache.tenant); setMember(contextCache.member); setOrganization(contextCache.organization); setActiveBranchIdState(contextCache.branchId); setLoading(false); return;
    }
    setLoading(true); setError('');
    try {
      const headers: Record<string, string> = { Authorization: `Bearer ${session.access_token}` };
      if (requestedTenantId) headers['x-tenant-id'] = requestedTenantId;
      const response = await fetch('/api/tenants/me', { headers, cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo cargar la empresa.');
      const selected = data.tenants?.find((item: { tenant: Tenant }) => item.tenant.id === data.activeTenantId) || data.tenants?.[0];
      if (!selected) throw new Error('No tienes una empresa activa.');
      selected.tenant = {
        ...selected.tenant,
        onboardingCompleted: selected.tenant.onboardingCompleted === true || (selected.tenant as Tenant & { onboarding_completed?: boolean }).onboarding_completed === true,
      };
      window.localStorage.setItem(STORAGE_KEY, selected.tenant.id);
      let nextOrganization = data.organization as TenantOrganization | undefined;
      if (!nextOrganization) {
        const organizationResponse = await fetch('/api/organization', { headers: { ...headers, 'x-tenant-id': selected.tenant.id }, cache: 'no-store' });
        const organizationData = await organizationResponse.json();
        if (!organizationResponse.ok) throw new Error(organizationData.error || 'No se pudo cargar la organización.');
        nextOrganization = organizationData.organization as TenantOrganization;
      }
      const assigned = Array.isArray(selected.member.branchIds) ? selected.member.branchIds : [];
      const visibleBranches = ADMIN_ROLES.has(selected.member.role) ? nextOrganization.branches : nextOrganization.branches.filter((branch) => assigned.includes(branch.id));
      const normalizedOrganization = { ...nextOrganization, branches: visibleBranches };
      const storedBranch = window.localStorage.getItem(`${BRANCH_STORAGE_PREFIX}${selected.tenant.id}`);
      const nextBranch = visibleBranches.find((branch) => branch.id === storedBranch)?.id || visibleBranches[0]?.id || null;
      setTenant(selected.tenant); setMember(selected.member); setOrganization(normalizedOrganization); setActiveBranchIdState(nextBranch);
      // El layout permanece montado entre cambios de ruta; conservar el contexto
      // cinco minutos evita repetir /api/tenants/me y /api/organization en cada clic.
      contextCache = { userId: session.user.id, tenantId: selected.tenant.id, expiresAt: Date.now() + 300_000, tenant: selected.tenant, member: selected.member, organization: normalizedOrganization, branchId: nextBranch };
      if (nextBranch) window.localStorage.setItem(`${BRANCH_STORAGE_PREFIX}${selected.tenant.id}`, nextBranch);
    } catch (cause) {
      setTenant(null); setMember(null); setOrganization(null); setActiveBranchIdState(null);
      setError(cause instanceof Error ? cause.message : 'No se pudo cargar tu empresa.');
    } finally { setLoading(false); }
    })();
    refreshInFlight = run;
    try { await run; } finally { if (refreshInFlight === run) refreshInFlight = null; }
  }, []);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user || null;
      setAuthUser(adaptAuthUser(user));
      if (user) void refresh();
      else { contextCache = null; refreshInFlight = null; setTenant(null); setMember(null); setOrganization(null); setActiveBranchIdState(null); setLoading(false); }
    });
    return () => listener.subscription.unsubscribe();
  }, [refresh]);

  const value = useMemo(() => ({ authUser, tenant, member, organization, activeBranchId, setActiveBranchId, loading, error, refresh }), [authUser, tenant, member, organization, activeBranchId, setActiveBranchId, loading, error, refresh]);
  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (!context) throw new Error('useTenant debe utilizarse dentro de TenantProvider.');
  return context;
}

export const ACTIVE_TENANT_STORAGE_KEY = STORAGE_KEY;
export const ACTIVE_BRANCH_STORAGE_PREFIX = BRANCH_STORAGE_PREFIX;
