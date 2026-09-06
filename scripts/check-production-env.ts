const required = [
  'FIREBASE_SERVICE_ACCOUNT_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_PRICE_STARTER',
  'STRIPE_PRICE_GROWTH',
  'STRIPE_PRICE_SCALE',
  'APP_URL',
  'RESEND_API_KEY',
  'RESEND_FROM',
  'SUPERADMIN_UIDS',
] as const;

const missing = required.filter((key) => !process.env[key]?.trim());

if (missing.length > 0) {
  console.error(`Faltan variables de producción: ${missing.join(', ')}`);
  process.exit(1);
}

try {
  const account = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}') as { project_id?: string; client_email?: string; private_key?: string };
  if (!account.project_id || !account.client_email || !account.private_key) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY incompleta.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'FIREBASE_SERVICE_ACCOUNT_KEY inválida.');
  process.exit(1);
}

if (!/^https:\/\//.test(process.env.APP_URL || '')) {
  console.error('APP_URL debe utilizar HTTPS en producción.');
  process.exit(1);
}

console.log(`Configuración de producción válida para ${process.env.APP_URL}.`);
