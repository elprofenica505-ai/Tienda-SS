import * as admin from 'firebase-admin';

function getFirebaseAdminApp() {
  if (admin.apps.length > 0) {
    return admin.apps[0];
  }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    // Durante el build de Vercel si no está disponible todavía, evitamos que rompa
    throw new Error("Falta la variable FIREBASE_SERVICE_ACCOUNT_KEY");
  }

  const serviceAccount = JSON.parse(raw);

  return admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const app = getFirebaseAdminApp();

export const adminAuth = admin.auth(app);
export const adminDb = admin.firestore(app);
