'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '@/lib/firebase';

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
};

type TenantContextValue = {
  authUser: User | null;
  tenant: Tenant | null;
  member: TenantMember | null;
  organization: TenantOrganization | null;
  activeBranchId: string | null;
  setActiveBranchId: (branchId: string) => void;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
};

const TenantContext = createContext<TenantContextValue | null>(null);
const STORAGE_KEY = 'ConexiaX.activeTenantId';
const BRANCH_STORAGE_PREFIX = 'ConexiaX.activeBranchId:';
const ADMIN_ROLES = new Set<TenantRole>(['owner', 'admin', 'gerente', 'jefe']);

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const [authUser, setAuthUser] = useState<User | null>(null);
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

  async function refresh() {
    if (!auth.currentUser) {
      setTenant(null); setMember(null); setOrganization(null); setActiveBranchIdState(null); setLoading(false); return;
    }
    setLoading(true); setError('');
    try {
      const token = await auth.currentUser.getIdToken();
      const tenantId = window.localStorage.getItem(STORAGE_KEY);
      const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
      if (tenantId) headers['x-tenant-id'] = tenantId;
      const response = await fetch('/api/tenants/me', { headers, cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo cargar la empresa.');
      const selected = data.tenants?.find((item: { tenant: Tenant }) => item.tenant.id === data.activeTenantId) || data.tenants?.[0];
      if (!selected) throw new Error('No tienes una empresa activa.');
      window.localStorage.setItem(STORAGE_KEY, selected.tenant.id);
      const organizationResponse = await fetch('/api/organization', { headers: { ...headers, 'x-tenant-id': selected.tenant.id }, cache: 'no-store' });
      const organizationData = await organizationResponse.json();
      if (!organizationResponse.ok) throw new Error(organizationData.error || 'No se pudo cargar la organización.');
      const nextOrganization = organizationData.organization as TenantOrganization;
      const assigned = Array.isArray(selected.member.branchIds) ? selected.member.branchIds : [];
      const visibleBranches = ADMIN_ROLES.has(selected.member.role) ? nextOrganization.branches : nextOrganization.branches.filter((branch) => assigned.includes(branch.id));
      const normalizedOrganization = { ...nextOrganization, branches: visibleBranches };
      const storedBranch = window.localStorage.getItem(`${BRANCH_STORAGE_PREFIX}${selected.tenant.id}`);
      const nextBranch = visibleBranches.find((branch) => branch.id === storedBranch)?.id || visibleBranches[0]?.id || null;
      setTenant(selected.tenant); setMember(selected.member); setOrganization(normalizedOrganization); setActiveBranchIdState(nextBranch);
      if (nextBranch) window.localStorage.setItem(`${BRANCH_STORAGE_PREFIX}${selected.tenant.id}`, nextBranch);
    } catch (cause) {
      setTenant(null); setMember(null); setOrganization(null); setActiveBranchIdState(null);
      setError(cause instanceof Error ? cause.message : 'No se pudo cargar tu empresa.');
    } finally { setLoading(false); }
  }

  useEffect(() => onAuthStateChanged(auth, (user) => {
    setAuthUser(user);
    if (user) void refresh();
    else { setTenant(null); setMember(null); setOrganization(null); setActiveBranchIdState(null); setLoading(false); }
  }), []);

  const value = useMemo(() => ({ authUser, tenant, member, organization, activeBranchId, setActiveBranchId, loading, error, refresh }), [authUser, tenant, member, organization, activeBranchId, setActiveBranchId, loading, error]);
  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (!context) throw new Error('useTenant debe utilizarse dentro de TenantProvider.');
  return context;
}

export const ACTIVE_TENANT_STORAGE_KEY = STORAGE_KEY;
export const ACTIVE_BRANCH_STORAGE_PREFIX = BRANCH_STORAGE_PREFIX;
