'use client';

import { useRouter } from 'next/navigation';

export function UpgradePrompt({ message }: { message: string }) {
  const router = useRouter();
  if (!message) return null;
  const isLimit = /límite|admite hasta|suscripción|plan actual|actualiza/i.test(message);
  return <div className="catalog-message">{message}{isLimit && <button className="button button-secondary" onClick={() => router.push('/workspace/billing')} style={{ marginLeft: 12 }}>Ver planes y actualizar ↗</button>}</div>;
}
