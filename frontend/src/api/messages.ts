import { apiClient } from './client';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  meta?: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface StoredMessage {
  id: string;
  senderId: string;
  recipientId: string;
  ciphertext: string;
  iv: string;
  timestamp: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ListConversationOptions {
  page?: number;
  pageSize?: number;
}

export async function listConversationMessages(
  userId: string,
  options: ListConversationOptions = {},
): Promise<Paginated<StoredMessage>> {
  const res = await apiClient.get<ApiEnvelope<StoredMessage[]>>(`/messages/${userId}`, {
    params: { page: options.page ?? 1, pageSize: options.pageSize ?? 20 },
  });
  const meta = res.data.meta!;
  return { items: res.data.data, total: meta.total, page: meta.page, pageSize: meta.pageSize };
}
