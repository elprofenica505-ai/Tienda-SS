import { cert, getApps, initializeApp, App } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

let adminApp: App | undefined;

function readServiceAccount(): Parameters<typeof cert>[0] {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  if (!raw) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY no está configurada.');
  }

  try {
    const account = JSON.parse(raw) as { project_id?: string; client_email?: string; private_key?: string };
    if (!account.project_id || !account.client_email || !account.private_key) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY está incompleta.');
    }
    const publicProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
    if (publicProjectId && account.project_id !== publicProjectId) {
      throw new Error(`FIREBASE_PROJECT_MISMATCH:${account.project_id}:${publicProjectId}`);
    }
    return account as Parameters<typeof cert>[0];
  } catch (error) {
    if (error instanceof Error && (error.message.startsWith('FIREBASE_') || error.message.startsWith('FIREBASE_PROJECT_'))) throw error;
    throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY no contiene JSON válido.');
  }
}

function getAdminApp() {
  if (adminApp) return adminApp;

  adminApp = getApps()[0] || initializeApp({
    credential: cert(readServiceAccount())
  });

  return adminApp;
}

export function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}

export function getAdminDb(): Firestore {
  return getFirestore(getAdminApp());
}
