import { apiClient } from '../api/client';
import type {
  E2eePublicKeyBundle,
  E2eePublicSignedPreKey,
  E2eeOneTimePreKey,
  EncryptedMessage,
} from './types';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

/**
 * Uploads the caller's PUBLIC key bundle. The argument type is
 * E2eePublicKeyBundle, which structurally cannot carry private key material —
 * always produce it via crypto.getPublicKeyBundle(), never by passing a local
 * bundle. The server is a public-key directory only.
 */
export async function uploadKeyBundle(bundle: E2eePublicKeyBundle): Promise<void> {
  await apiClient.post<ApiEnvelope<void>>('/e2ee/keys', bundle);
}

export async function fetchKeyBundle(userId: string): Promise<E2eePublicKeyBundle> {
  const res = await apiClient.get<ApiEnvelope<E2eePublicKeyBundle>>(`/e2ee/keys/${userId}`);
  return res.data.data;
}

export async function rotateSignedPreKey(signedPreKey: E2eePublicSignedPreKey): Promise<void> {
  await apiClient.put<ApiEnvelope<void>>('/e2ee/keys/signed-pre-key', { signedPreKey });
}

export async function rotateOneTimePreKeys(oneTimePreKeys: E2eeOneTimePreKey[]): Promise<void> {
  await apiClient.put<ApiEnvelope<void>>('/e2ee/keys/one-time-pre-keys', { oneTimePreKeys });
}

export async function consumeOneTimePreKeys(keyIds: number[]): Promise<void> {
  await apiClient.post<ApiEnvelope<void>>('/e2ee/keys/one-time-pre-keys/consume', { keyIds });
}

export async function sendEncryptedMessage(message: EncryptedMessage): Promise<void> {
  await apiClient.post<ApiEnvelope<void>>('/e2ee/messages', message);
}

export async function deleteKeyBundle(): Promise<void> {
  await apiClient.delete<ApiEnvelope<void>>('/e2ee/keys');
}
