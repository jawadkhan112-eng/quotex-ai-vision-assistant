import crypto from 'crypto';

/**
 * AES-256-GCM Encryption Helper for API Key Vault
 * Uses ENCRYPTION_MASTER_SECRET from environment variables.
 */

const MASTER_SECRET = process.env.ENCRYPTION_MASTER_SECRET || 'dev_quotex_master_secret_vault_key_default_2026';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function getKey(): Buffer {
  return crypto.createHash('sha256').update(MASTER_SECRET).digest();
}

/**
 * Encrypts plaintext string using AES-256-GCM.
 * Format: iv:authTag:ciphertext (all in hex)
 */
export function encryptSecret(plainText: string): string {
  if (!plainText) return '';
  // If already encrypted, don't re-encrypt
  if (plainText.startsWith('enc:v1:')) return plainText;

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);

  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `enc:v1:${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts AES-256-GCM ciphertext.
 * Returns original text or decrypted text.
 */
export function decryptSecret(cipherText: string): string {
  if (!cipherText) return '';
  if (!cipherText.startsWith('enc:v1:')) {
    // Plaintext legacy fallback
    return cipherText;
  }

  try {
    const parts = cipherText.split(':');
    if (parts.length !== 5) return cipherText;

    const [, , ivHex, authTagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.warn('[Crypto] Decryption failed, returning empty string:', err);
    return '';
  }
}

/**
 * Safely masks secret key for UI display and safe logging.
 * Never exposes full secret.
 */
export function maskKey(key: string): string {
  if (!key) return 'NOT_SET';
  const clean = key.trim();
  if (clean.length < 8) return 'SET';
  return `${clean.slice(0, 4)}...${clean.slice(-4)}`;
}
