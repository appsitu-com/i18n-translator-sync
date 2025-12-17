import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from 'crypto'

// Prefix to identify encrypted values
export const ENCRYPTED_PREFIX = 'ENC:';

// Algorithm to use for encryption
const ALGORITHM = 'aes-256-gcm';
// Key derivation iterations
const ITERATIONS = 100000;
// Salt length in bytes
const SALT_LENGTH = 16;
// Initialization vector length in bytes
const IV_LENGTH = 12;
// Authentication tag length in bytes
const AUTH_TAG_LENGTH = 16;

/**
 * Check if a value is encrypted (starts with the encrypted prefix)
 * @param value The value to check
 * @returns True if the value is encrypted
 */
export function isEncrypted(value: string | undefined): boolean {
  return !!value && value.startsWith(ENCRYPTED_PREFIX);
}

/**
 * Derive a cryptographic key from a passphrase and salt
 * @param passphrase The passphrase to derive the key from
 * @param salt The salt to use for derivation
 * @returns The derived key
 */
function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return pbkdf2Sync(passphrase, salt, ITERATIONS, 32, 'sha256');
}

/**
 * Encrypt an API key using a passphrase
 * @param apiKey The API key to encrypt
 * @param passphrase The passphrase to use for encryption
 * @returns The encrypted API key with prefix
 */
export function encryptApiKey(apiKey: string, passphrase: string): string {
  if (!apiKey || !passphrase) {
    throw new Error('API key and passphrase are required');
  }

  if (isEncrypted(apiKey)) {
    throw new Error('API key is already encrypted');
  }

  // Generate a random salt
  const salt = randomBytes(SALT_LENGTH);
  // Generate a random IV
  const iv = randomBytes(IV_LENGTH);
  // Derive a key from the passphrase and salt
  const key = deriveKey(passphrase, salt);

  // Create cipher
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  // Encrypt the API key
  let encrypted = cipher.update(apiKey, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  // Get the authentication tag
  const authTag = cipher.getAuthTag();

  // Combine all components: salt + iv + authTag + encrypted data
  // Format: salt (16 bytes) + iv (12 bytes) + authTag (16 bytes) + encrypted data
  const combined = Buffer.concat([
    salt,
    iv,
    authTag,
    Buffer.from(encrypted, 'base64')
  ]);

  // Return the encrypted key with prefix
  return ENCRYPTED_PREFIX + combined.toString('base64');
}

/**
 * Decrypt an encrypted API key using a passphrase
 * @param encryptedApiKey The encrypted API key (with prefix)
 * @param passphrase The passphrase to use for decryption
 * @returns The decrypted API key
 */
export function decryptApiKey(encryptedApiKey: string, passphrase: string): string {
  if (!encryptedApiKey || !passphrase) {
    throw new Error('Encrypted API key and passphrase are required');
  }

  if (!isEncrypted(encryptedApiKey)) {
    throw new Error('API key is not encrypted');
  }

  // Remove the prefix
  const data = encryptedApiKey.substring(ENCRYPTED_PREFIX.length);

  try {
    // Decode the combined data
    const buffer = Buffer.from(data, 'base64');

    // Extract components
    const salt = buffer.subarray(0, SALT_LENGTH);
    const iv = buffer.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const authTag = buffer.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = buffer.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);

    // Derive key from passphrase and salt
    const key = deriveKey(passphrase, salt);

    // Create decipher
    const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);

    // Decrypt the data
    let decrypted = decipher.update(encrypted.toString('base64'), 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    throw new Error(`Failed to decrypt API key: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Try to decrypt an API key if it's encrypted
 *
 * @param key The API key to decrypt if needed
 * @param passphrase The passphrase to use for decryption
 * @returns The decrypted key if encrypted and passphrase available, otherwise the original key
 */
export function tryDecryptKey(key: string | undefined, passphrase: string | undefined): string | undefined {
  if (key && isEncrypted(key) && passphrase) {
    return decryptApiKey(key, passphrase);
  }
  return key;
}