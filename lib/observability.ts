export type LogLevel = 'info' | 'warn' | 'error';

export function logEvent(level: LogLevel, event: string, fields: Record<string, unknown> = {}) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...fields,
  };
  const serialized = JSON.stringify(payload);
  if (level === 'error') console.error(serialized);
  else if (level === 'warn') console.warn(serialized);
  else console.info(serialized);
}
