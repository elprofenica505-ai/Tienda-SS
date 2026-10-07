export type ConnectionQuality = 'online' | 'weak' | 'offline';

export const WEAK_LATENCY_MS = 1800;
export const PROBE_TIMEOUT_MS = 6000;
export const PROBE_INTERVAL_MS = 20_000;
export const WEAK_EFFECTIVE_TYPES = new Set(['slow-2g', '2g']);

const NETWORK_ERROR_HINTS = [
  'failed to fetch',
  'networkerror',
  'network request failed',
  'network error',
  'load failed',
  'the internet connection appears to be offline',
  'err_internet_disconnected',
  'err_network_changed',
  'err_name_not_resolved',
  'err_connection_reset',
  'err_connection_timed_out',
  'socket hang up',
  'fetch failed',
  'timeout',
  'timed out',
  'aborted',
];

/**
 * True when the failure is a transport problem (no signal, DNS, reset, timeout)
 * rather than a real answer from the server. Those must never be reported to the
 * cashier as "Error de servidor" — the server was simply never reached.
 */
export function isNetworkError(error: unknown): boolean {
  if (!error) return false;
  if (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError') return true;
  if (error instanceof Error && error.name === 'AbortError') return true;
  if (error instanceof TypeError) return true;
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return NETWORK_ERROR_HINTS.some((hint) => message.includes(hint));
}

/** A 5xx means the request DID arrive; anything else upstream is treated as a reachability problem. */
export function isServerStatus(status: number): boolean {
  return Number.isFinite(status) && status >= 500 && status <= 599;
}

export type ProbeInput = {
  online: boolean;
  reachable: boolean;
  latencyMs: number;
  effectiveType?: string;
  consecutiveFailures?: number;
};

export function classifyProbe(input: ProbeInput): ConnectionQuality {
  if (!input.online) return 'offline';
  if (!input.reachable) return (input.consecutiveFailures || 0) >= 2 ? 'offline' : 'weak';
  if (input.effectiveType && WEAK_EFFECTIVE_TYPES.has(input.effectiveType)) return 'weak';
  if (input.latencyMs >= WEAK_LATENCY_MS) return 'weak';
  return 'online';
}

export type ConnectivityCopy = { title: string; detail: string; tone: ConnectionQuality };

export function connectivityCopy(quality: ConnectionQuality): ConnectivityCopy | null {
  if (quality === 'offline') {
    return {
      tone: 'offline',
      title: 'Sin conexión',
      detail: 'No hay internet en este momento. Nada se perdió: reintenta cuando vuelva la señal.',
    };
  }
  if (quality === 'weak') {
    return {
      tone: 'weak',
      title: 'Señal débil',
      detail: 'Tu conexión está lenta. Puede que algunos datos tarden en cargar.',
    };
  }
  return null;
}

export const RECOVERED_COPY: ConnectivityCopy = {
  tone: 'online',
  title: 'Conexión restablecida',
  detail: 'Ya estás en línea otra vez.',
};

/**
 * Turns a failed request into a message the user can act on. Connectivity
 * problems are surfaced as weak-signal wording instead of a server error.
 */
export function describeRequestError(error: unknown, fallback: string, quality: ConnectionQuality = 'online'): string {
  if (quality === 'offline') return 'Sin conexión: revisa tu internet e inténtalo de nuevo.';
  if (isNetworkError(error)) return 'Señal débil: no pudimos conectar con el servidor. Reintenta en unos segundos.';
  if (quality === 'weak') return 'Señal débil: la conexión está lenta y la operación no se completó. Reintenta.';
  return error instanceof Error && error.message ? error.message : fallback;
}
