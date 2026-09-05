'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '@/lib/firebase';

export type TenantRole = 'owner' | 'admin' | 'jefe' | 'vendedor' | 'bodega' | 'chofer' | 'cajero';

export type Tenant = {
  id: string;
  name: string;
  plan?: string;
  status?: string;
  onboardingCompleted?: boolean;
};

export type TenantMember = {
  uid: string;
  tenantId: string;
  name?: string;
  email?: string;
  role: TenantRole;
  status: string;
};

type TenantContextValue = {
  authUser: User | null;
  tenant: Tenant | null;
  member: TenantMember | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
};

const TenantContext = createContext<TenantContextValue | null>(null);
const STORAGE_KEY = 'nexoflow.activeTenantId';

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [member, setMember] = useState<TenantMember | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function refresh() {
    if (!auth.currentUser) {
      setTenant(null);
      setMember(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const token = await auth.currentUser.getIdToken();
      const tenantId = window.localStorage.getItem(STORAGE_KEY);
      const response = await fetch('/api/tenants/me', {
        headers: {
          Authorization: `Bearer ${token}`,
          ...(tenantId ? { 'x-tenant-id': tenantId } : {})
        },
        cache: 'no-store'
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo cargar la empresa.');

      const selected = data.tenants?.find((item: { tenant: Tenant }) => item.tenant.id === data.activeTenantId)
        || data.tenants?.[0];
      if (!selected) throw new Error('No tienes una empresa activa.');

      window.localStorage.setItem(STORAGE_KEY, selected.tenant.id);
      setTenant(selected.tenant);
      setMember(selected.member);
    } catch (cause) {
      setTenant(null);
      setMember(null);
      setError(cause instanceof Error ? cause.message : 'No se pudo cargar tu empresa.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => onAuthStateChanged(auth, (user) => {
    setAuthUser(user);
    if (user) void refresh();
    else {
      setTenant(null);
      setMember(null);
      setLoading(false);
    }
  }), []);

  const value = useMemo(() => ({ authUser, tenant, member, loading, error, refresh }), [authUser, tenant, member, loading, error]);
  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (!context) throw new Error('useTenant debe utilizarse dentro de TenantProvider.');
  return context;
}

export const ACTIVE_TENANT_STORAGE_KEY = STORAGE_KEY;
