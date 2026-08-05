import { AppError } from '../../errors/AppError.js';
import { e2eeRepository, type E2eeKeys } from './e2ee.repository.js';
import { logger } from '../../config/logger.js';
import type {
  PreKeyRecord,
  SignedPreKeyRecord,
  IdentityKeyRecord,
  OneTimePreKeyRecord,
} from './e2ee.model.js';

// ---------------------------------------------------------------------------
// This service is a PUBLIC-KEY DIRECTORY and CIPHERTEXT RELAY only.
//
// It never generates key material and never touches a private key: identity,
// signed-pre-key and one-time-pre-key keypairs are all generated on-device
// (frontend/src/e2ee/crypto.ts). Clients upload the PUBLIC halves plus a real
// signature authenticating the signed pre-key. The server stores and serves
// those public keys, and relays ciphertext without ever holding a decryption
// key. Any change that would let this module see plaintext or a private key
// violates CLAUDE.md §5 and must be rejected, not implemented.
// ---------------------------------------------------------------------------

export interface KeyBundle {
  identityKey: IdentityKeyRecord;
  signedPreKey: SignedPreKeyRecord;
  preKeys: PreKeyRecord[];
  oneTimePreKeys: OneTimePreKeyRecord[];
}

export interface EncryptedMessagePayload {
  recipientId: string;
  ciphertext: string;
  timestamp: number;
  senderId: string;
}

export const e2eeService = {
  /**
   * Stores a client-generated PUBLIC key bundle. All private key material was
   * generated and retained on-device; nothing private reaches this method.
   */
  async storePublicKeys(userId: string, bundle: KeyBundle): Promise<KeyBundle> {
    const keys: E2eeKeys = {
      identityKey: {
        publicKey: bundle.identityKey.publicKey,
        signingPublicKey: bundle.identityKey.signingPublicKey,
      },
      signedPreKey: bundle.signedPreKey,
      preKeys: bundle.preKeys,
      oneTimePreKeys: bundle.oneTimePreKeys,
    };

    await e2eeRepository.upsert(userId, keys);

    logger.info({ userId }, 'E2EE public key bundle stored');
    return keys;
  },

  async getKeyBundle(userId: string): Promise<KeyBundle> {
    const stored = await e2eeRepository.findByUserId(userId);
    if (!stored) {
      throw new AppError(404, 'E2EE_KEYS_NOT_FOUND', 'E2EE keys not found for this user');
    }

    if (!stored.identityKey || !stored.signedPreKey) {
      throw new AppError(404, 'E2EE_KEYS_NOT_FOUND', 'E2EE keys not found for this user');
    }

    return {
      identityKey: stored.identityKey,
      signedPreKey: stored.signedPreKey,
      preKeys: stored.preKeys,
      oneTimePreKeys: stored.oneTimePreKeys,
    };
  },

  /** Replaces the stored signed pre-key with a client-generated public one. */
  async rotateSignedPreKey(
    userId: string,
    signedPreKey: SignedPreKeyRecord,
  ): Promise<SignedPreKeyRecord> {
    const stored = await e2eeRepository.findByUserId(userId);
    if (!stored) {
      throw new AppError(404, 'E2EE_KEYS_NOT_FOUND', 'E2EE keys not found for this user');
    }

    await e2eeRepository.updateSignedPreKey(userId, signedPreKey);

    logger.info({ userId }, 'E2EE signed pre-key rotated');
    return signedPreKey;
  },

  /** Replaces the stored one-time pre-keys with client-generated public ones. */
  async rotateOneTimePreKeys(
    userId: string,
    oneTimePreKeys: OneTimePreKeyRecord[],
  ): Promise<OneTimePreKeyRecord[]> {
    const stored = await e2eeRepository.findByUserId(userId);
    if (!stored) {
      throw new AppError(404, 'E2EE_KEYS_NOT_FOUND', 'E2EE keys not found for this user');
    }

    await e2eeRepository.updateOneTimePreKeys(userId, oneTimePreKeys);

    logger.info({ userId, count: oneTimePreKeys.length }, 'E2EE one-time pre-keys rotated');
    return oneTimePreKeys;
  },

  async storePreKeys(userId: string, preKeys: PreKeyRecord[]): Promise<void> {
    await e2eeRepository.updatePreKeys(userId, preKeys);
    logger.info({ userId, count: preKeys.length }, 'E2EE pre-keys stored');
  },

  async consumeOneTimePreKeys(userId: string, keyIds: number[]): Promise<void> {
    await e2eeRepository.consumeOneTimePreKeys(userId, keyIds);
    logger.info({ userId, keyIds }, 'E2EE one-time pre-keys consumed');
  },

  async storeEncryptedMessage(
    senderId: string,
    recipientId: string,
    _ciphertext: string,
    _timestamp: number,
  ): Promise<void> {
    // Ciphertext relay only — never log or persist the ciphertext body or any
    // plaintext. Only routing ids are recorded.
    logger.info({ senderId, recipientId }, 'E2EE encrypted message relayed');
  },

  async deleteKeys(userId: string): Promise<void> {
    await e2eeRepository.deleteByUserId(userId);
    logger.info({ userId }, 'E2EE keys deleted');
  },
};
