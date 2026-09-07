import {
  getMultiFactorResolver,
  multiFactor,
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  RecaptchaVerifier,
  type MultiFactorResolver,
  type User,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';

export type MfaEnrollment = {
  verificationId: string;
  verifier: RecaptchaVerifier;
};

export type MfaChallenge = {
  resolver: MultiFactorResolver;
  verificationId: string;
  verifier: RecaptchaVerifier;
};

export function hasEnrolledMfa(user: User): boolean {
  return multiFactor(user).enrolledFactors.length > 0;
}

export async function beginPhoneMfaEnrollment(phoneNumber: string, containerId: string): Promise<MfaEnrollment> {
  const user = auth.currentUser;
  if (!user) throw new Error('AUTH_REQUIRED');
  const value = phoneNumber.trim();
  if (!/^\+[1-9]\d{7,14}$/.test(value)) throw new Error('PHONE_FORMAT');
  const verifier = new RecaptchaVerifier(auth, containerId, { size: 'invisible' });
  const session = await multiFactor(user).getSession();
  const provider = new PhoneAuthProvider(auth);
  const verificationId = await provider.verifyPhoneNumber({ phoneNumber: value, session }, verifier);
  return { verificationId, verifier };
}

export async function completePhoneMfaEnrollment(enrollment: MfaEnrollment, code: string, displayName = 'Teléfono administrativo'): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('AUTH_REQUIRED');
  if (!/^\d{6}$/.test(code.trim())) throw new Error('CODE_FORMAT');
  const credential = PhoneAuthProvider.credential(enrollment.verificationId, code.trim());
  const assertion = PhoneMultiFactorGenerator.assertion(credential);
  await multiFactor(user).enroll(assertion, displayName.trim().slice(0, 80) || 'Teléfono administrativo');
  await user.getIdToken(true);
  enrollment.verifier.clear();
}

export async function beginMfaSignIn(error: unknown, containerId: string): Promise<MfaChallenge> {
  const resolver = getMfaResolver(error);
  if (!resolver || resolver.hints.length === 0) throw new Error('MFA_UNAVAILABLE');
  const verifier = new RecaptchaVerifier(auth, containerId, { size: 'invisible' });
  const hint = resolver.hints[0];
  const provider = new PhoneAuthProvider(auth);
  const verificationId = await provider.verifyPhoneNumber({ multiFactorHint: hint, session: resolver.session }, verifier);
  return { resolver, verificationId, verifier };
}

export function getMfaResolver(error: unknown): MultiFactorResolver | null {
  if (typeof error !== 'object' || error === null || !('code' in error) || error.code !== 'auth/multi-factor-auth-required') return null;
  return getMultiFactorResolver(auth, error as Parameters<typeof getMultiFactorResolver>[1]);
}

export async function completeMfaSignIn(resolver: MultiFactorResolver, verificationId: string, code: string): Promise<void> {
  if (!/^\d{6}$/.test(code.trim())) throw new Error('CODE_FORMAT');
  const credential = PhoneAuthProvider.credential(verificationId, code.trim());
  await resolver.resolveSignIn(PhoneMultiFactorGenerator.assertion(credential));
}
