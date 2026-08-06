import { generateMnemonic, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { argon2id } from '@noble/hashes/argon2.js';
import { gcm } from '@noble/ciphers/aes.js';
import type { E2eeKeyBundle } from './types.js';
import { bytesToBase64, base64ToBytes } from './base64';

// ---------------------------------------------------------------------------
// Recovery-key backup crypto (server-blind).
//
// The user's private key bundle is encrypted on-device under a key derived from
// a 24-word BIP39 recovery phrase (256-bit entropy) via Argon2id. Only the
// resulting ciphertext + the (non-secret) salt/KDF params leave the device; the
// phrase and derived key never do. Restoring the identity on a new device lets
// it decrypt the server's stored ciphertext history — which works today because
// 1:1 chat has no forward secrecy, so the identity key IS the agreement key.
// Revisit when X3DH/Double-Ratchet lands (that breaks this property).
//
// KDF cost is defense-in-depth here, NOT the primary barrier: a full-entropy
// 256-bit mnemonic is not brute-forceable regardless of Argon2 parameters, so
// the params are tuned for acceptable on-device time on a rare operation
// (backup once, restore once) rather than maximal hardness.
// ---------------------------------------------------------------------------

export interface RecoveryKdfParams {
  algorithm: 'argon2id';
  memoryKiB: number;
  iterations: number;
  parallelism: number;
}

export interface RecoveryBackupBlob {
  ciphertext: string;
  iv: string;
  salt: string;
  kdf: RecoveryKdfParams;
  version: number;
}

export const RECOVERY_BACKUP_VERSION = 1;

/** Argon2id parameters for v1 backups. Memory-hard at the OWASP memory floor. */
export const RECOVERY_KDF_PARAMS: RecoveryKdfParams = {
  algorithm: 'argon2id',
  memoryKiB: 19456, // 19 MiB
  iterations: 2,
  parallelism: 1,
};

const SALT_BYTES = 16;
const NONCE_BYTES = 12;
const KEY_BYTES = 32;
const MNEMONIC_STRENGTH_BITS = 256; // 24 words

/** Thrown when a recovery phrase fails to decrypt a backup (wrong phrase). */
export class RecoveryPhraseError extends Error {
  constructor() {
    super('The recovery phrase does not match this backup');
    this.name = 'RecoveryPhraseError';
  }
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  // getRandomValues is native in Node (tests) and polyfilled on-device.
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

/** Generates a fresh 24-word BIP39 recovery phrase. */
export function generateRecoveryPhrase(): string {
  return generateMnemonic(wordlist, MNEMONIC_STRENGTH_BITS);
}

/** Canonicalizes a phrase for comparison/derivation (NFKD, trimmed, lower, single-spaced). */
export function normalizeRecoveryPhrase(phrase: string): string {
  return phrase.normalize('NFKD').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** True if the phrase is a valid BIP39 mnemonic (wordlist + checksum). */
export function isValidRecoveryPhrase(phrase: string): boolean {
  try {
    return validateMnemonic(normalizeRecoveryPhrase(phrase), wordlist);
  } catch {
    return false;
  }
}

function deriveKey(phrase: string, salt: Uint8Array, kdf: RecoveryKdfParams): Uint8Array {
  const password = new TextEncoder().encode(normalizeRecoveryPhrase(phrase));
  return argon2id(password, salt, {
    t: kdf.iterations,
    m: kdf.memoryKiB,
    p: kdf.parallelism,
    dkLen: KEY_BYTES,
  });
}

/**
 * Encrypts a private key bundle under a key derived from the phrase, producing
 * the opaque blob uploaded to the server. Generates a fresh random salt + nonce
 * each call, so re-enabling backup with the same phrase yields a new blob.
 */
export function createRecoveryBackup(
  bundle: E2eeKeyBundle,
  phrase: string,
  kdf: RecoveryKdfParams = RECOVERY_KDF_PARAMS,
): RecoveryBackupBlob {
  const salt = randomBytes(SALT_BYTES);
  const nonce = randomBytes(NONCE_BYTES);
  const key = deriveKey(phrase, salt, kdf);
  const plaintext = new TextEncoder().encode(JSON.stringify(bundle));
  const ciphertext = gcm(key, nonce).encrypt(plaintext);
  return {
    ciphertext: bytesToBase64(ciphertext),
    iv: bytesToBase64(nonce),
    salt: bytesToBase64(salt),
    kdf,
    version: RECOVERY_BACKUP_VERSION,
  };
}

/**
 * Decrypts a backup blob with the phrase, returning the restored private key
 * bundle. Throws RecoveryPhraseError if the phrase is wrong (AES-GCM auth-tag
 * mismatch) and a plain Error for an unsupported version/algorithm.
 */
export function restoreRecoveryBackup(blob: RecoveryBackupBlob, phrase: string): E2eeKeyBundle {
  if (blob.version !== RECOVERY_BACKUP_VERSION) {
    throw new Error(`Unsupported recovery backup version: ${blob.version}`);
  }
  if (blob.kdf.algorithm !== 'argon2id') {
    throw new Error(`Unsupported recovery KDF: ${blob.kdf.algorithm}`);
  }
  const key = deriveKey(phrase, base64ToBytes(blob.salt), blob.kdf);
  let plaintext: Uint8Array;
  try {
    plaintext = gcm(key, base64ToBytes(blob.iv)).decrypt(base64ToBytes(blob.ciphertext));
  } catch {
    throw new RecoveryPhraseError();
  }
  return JSON.parse(new TextDecoder().decode(plaintext)) as E2eeKeyBundle;
}
