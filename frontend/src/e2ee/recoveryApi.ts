import { apiClient } from '../api/client';
import type { RecoveryBackupBlob } from './recovery';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

export interface RecoveryBackupStatus {
  exists: boolean;
  updatedAt: string | null;
}

/** Uploads the caller's encrypted backup blob (create or replace). */
export async function putRecoveryBackup(blob: RecoveryBackupBlob): Promise<void> {
  await apiClient.put<ApiEnvelope<{ updatedAt: string }>>('/e2ee/recovery', blob);
}

/** Fetches the caller's encrypted backup blob for restore (404 if none). */
export async function fetchRecoveryBackup(): Promise<RecoveryBackupBlob> {
  const res = await apiClient.get<ApiEnvelope<RecoveryBackupBlob>>('/e2ee/recovery');
  return res.data.data;
}

/** Lightweight existence check for UI — does not download the ciphertext blob. */
export async function fetchRecoveryBackupStatus(): Promise<RecoveryBackupStatus> {
  const res = await apiClient.get<ApiEnvelope<RecoveryBackupStatus>>('/e2ee/recovery/status');
  return res.data.data;
}

/** Disables (soft-deletes) the caller's backup. */
export async function deleteRecoveryBackup(): Promise<void> {
  await apiClient.delete<ApiEnvelope<{ deleted: boolean }>>('/e2ee/recovery');
}
