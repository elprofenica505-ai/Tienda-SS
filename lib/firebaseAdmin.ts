import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function getServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error("Falta la variable FIREBASE_SERVICE_ACCOUNT_KEY");
  return JSON.parse(raw);
}

const app = getApps().length === 0
  ? initializeApp({ credential: cert(getServiceAccount()) })
  : getApps()[0];

export const adminAuth = getAuth(app);
export const adminDb = getFirestore(app);
