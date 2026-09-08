import { redirect } from 'next/navigation';

/**
 * The former root-collection dashboard is retained only for source compatibility.
 * Production users enter the tenant-scoped workspace exclusively.
 */
export default function DashboardPage() {
  redirect('/workspace');
}
