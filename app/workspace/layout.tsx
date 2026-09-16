import { TenantProvider } from '@/components/tenant/TenantProvider';

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <TenantProvider>{children}</TenantProvider>;
}
