import { apiClient } from '../api/client';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

export interface SenderKeyEnvelope {
  recipientId: string;
  keyId: number;
  ciphertext: string;
  iv: string;
  createdAt: string;
}

export interface SenderKeySummary {
  senderId: string;
  keyId: number;
  updatedAt: string;
}

export async function uploadSenderKeys(
  groupId: string,
  envelopes: SenderKeyEnvelope[],
): Promise<{ envelopes: SenderKeyEnvelope[] }> {
  const res = await apiClient.post<ApiEnvelope<{ envelopes: SenderKeyEnvelope[] }>>(
    `/e2ee/groups/${groupId}/sender-keys`,
    { envelopes },
  );
  return res.data.data;
}

export async function fetchSenderKey(
  groupId: string,
  senderId: string,
): Promise<SenderKeyEnvelope> {
  const res = await apiClient.get<ApiEnvelope<SenderKeyEnvelope>>(
    `/e2ee/groups/${groupId}/sender-keys/${senderId}`,
  );
  return res.data.data;
}

export async function listSenderKeys(groupId: string): Promise<SenderKeySummary[]> {
  const res = await apiClient.get<ApiEnvelope<SenderKeySummary[]>>(
    `/e2ee/groups/${groupId}/sender-keys`,
  );
  return res.data.data;
}

export async function deleteSenderKey(groupId: string, senderId: string): Promise<void> {
  await apiClient.delete(`/e2ee/groups/${groupId}/sender-keys/${senderId}`);
}
