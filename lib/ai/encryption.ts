import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

function configuredEncryptionKey(): Buffer {
  const source = process.env.AI_ENCRYPTION_KEY?.trim();
  if (!source) throw new Error('AI_ENCRYPTION_KEY_MISSING');

  // A deployment can provide a raw 32-byte key as hexadecimal or base64. For a
  // human-managed secret/passphrase we deterministically derive a 32-byte key,
  // still using AES-256-GCM for the stored payload.
  if (/^[a-f0-9]{64}$/i.test(source)) return Buffer.from(source, 'hex');
  try {
    const decoded = Buffer.from(source, 'base64');
    if (decoded.length === 32) return decoded;
  } catch {
    // Fall through to SHA-256 below. The actual value is never returned.
  }
  return createHash('sha256').update(source, 'utf8').digest();
}

/** Encrypts a tenant-owned API key as v1:iv:authTag:ciphertext (base64url). */
export function encryptApiKey(apiKey: string): string {
  const plainText = apiKey.trim();
  if (!plainText) throw new Error('AI_API_KEY_EMPTY');

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, configuredEncryptionKey(), iv, { authTagLength: AUTH_TAG_BYTES });
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64url'), authTag.toString('base64url'), encrypted.toString('base64url')].join(':');
}

/** Decrypts only in server-side request handlers. Never send this result to a client. */
export function decryptApiKey(payload: string): string {
  try {
    const [version, ivPart, tagPart, encryptedPart, ...extra] = payload.split(':');
    if (version !== VERSION || !ivPart || !tagPart || !encryptedPart || extra.length) throw new Error('invalid_payload');
    const iv = Buffer.from(ivPart, 'base64url');
    const authTag = Buffer.from(tagPart, 'base64url');
    const encrypted = Buffer.from(encryptedPart, 'base64url');
    if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES || !encrypted.length) throw new Error('invalid_payload');

    const decipher = createDecipheriv(ALGORITHM, configuredEncryptionKey(), iv, { authTagLength: AUTH_TAG_BYTES });
    decipher.setAuthTag(authTag);
    const value = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8').trim();
    if (!value) throw new Error('invalid_payload');
    return value;
  } catch (error) {
    if (error instanceof Error && error.message === 'AI_ENCRYPTION_KEY_MISSING') throw error;
    throw new Error('AI_API_KEY_DECRYPT_FAILED');
  }
}

/** UI-safe key preview: abcd••••wxyz. The full key is never returned by an API. */
export function maskApiKey(apiKey: string): string {
  const value = apiKey.trim();
  if (!value) return '';
  if (value.length <= 4) return '••••';
  const edge = value.length >= 8 ? 4 : 2;
  return `${value.slice(0, edge)}••••${value.slice(-edge)}`;
}

export function hasAiEncryptionKey(): boolean {
  return Boolean(process.env.AI_ENCRYPTION_KEY?.trim());
}
