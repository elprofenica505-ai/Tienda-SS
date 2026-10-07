'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ConnectionQuality,
  ConnectivityCopy,
  PROBE_INTERVAL_MS,
  PROBE_TIMEOUT_MS,
  RECOVERED_COPY,
  classifyProbe,
  connectivityCopy,
} from '@/lib/connectivity';

type NetworkInformation = { effectiveType?: string; addEventListener?: (type: string, listener: () => void) => void; removeEventListener?: (type: string, listener: () => void) => void };

function connection(): NetworkInformation | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return (navigator as Navigator & { connection?: NetworkInformation }).connection;
}

/**
 * Global, always-mounted connectivity watcher. It pings the cheap liveness
 * endpoint and reports weak signal / offline as a floating message, so a flaky
 * network never reaches the user as a generic "Error de servidor".
 */
export function ConnectivityToast() {
  const [quality, setQuality] = useState<ConnectionQuality>('online');
  const [copy, setCopy] = useState<ConnectivityCopy | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const failures = useRef(0);
  const previous = useRef<ConnectionQuality>('online');
  const recoveredTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const probe = useCallback(async () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      failures.current += 1;
      setQuality('offline');
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
    let reachable = false;
    try {
      const response = await fetch('/api/health', { cache: 'no-store', signal: controller.signal });
      reachable = response.ok;
    } catch {
      reachable = false;
    } finally {
      clearTimeout(timer);
    }
    const latencyMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - started;
    failures.current = reachable ? 0 : failures.current + 1;
    setQuality(classifyProbe({
      online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
      reachable,
      latencyMs,
      effectiveType: connection()?.effectiveType,
      consecutiveFailures: failures.current,
    }));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = () => { if (!cancelled && (typeof document === 'undefined' || document.visibilityState === 'visible')) void probe(); };
    run();
    const interval = setInterval(run, PROBE_INTERVAL_MS);
    const goOffline = () => { failures.current += 1; setQuality('offline'); };
    window.addEventListener('online', run);
    window.addEventListener('offline', goOffline);
    document.addEventListener('visibilitychange', run);
    const net = connection();
    net?.addEventListener?.('change', run);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener('online', run);
      window.removeEventListener('offline', goOffline);
      document.removeEventListener('visibilitychange', run);
      net?.removeEventListener?.('change', run);
    };
  }, [probe]);

  useEffect(() => {
    const before = previous.current;
    previous.current = quality;
    if (recoveredTimer.current) { clearTimeout(recoveredTimer.current); recoveredTimer.current = null; }
    if (quality !== 'online') { setDismissed(false); setCopy(connectivityCopy(quality)); return; }
    if (before === 'online') { setCopy(null); return; }
    setDismissed(false);
    setCopy(RECOVERED_COPY);
    recoveredTimer.current = setTimeout(() => setCopy(null), 4000);
  }, [quality]);

  useEffect(() => () => { if (recoveredTimer.current) clearTimeout(recoveredTimer.current); }, []);

  if (!copy || dismissed) return null;
  return (
    <div className={`connectivity-toast connectivity-${copy.tone} no-print`} role="status" aria-live="polite">
      <span className="connectivity-dot" aria-hidden="true" />
      <div className="connectivity-copy">
        <b>{copy.title}</b>
        <small>{copy.detail}</small>
      </div>
      {copy.tone === 'online'
        ? null
        : <button className="connectivity-retry" type="button" onClick={() => void probe()}>Reintentar</button>}
      <button className="connectivity-close" type="button" aria-label="Ocultar aviso de conexión" onClick={() => setDismissed(true)}>×</button>
    </div>
  );
}
