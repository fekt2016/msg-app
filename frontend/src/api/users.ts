import { apiClient } from './client';
import type { AvatarAsset, SafeUser } from './auth';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

export interface UpdateProfileInput {
  displayName?: string;
  bio?: string;
}

export async function getMyProfile(): Promise<SafeUser> {
  const res = await apiClient.get<ApiEnvelope<SafeUser>>('/users/me');
  return res.data.data;
}

export async function listUsers(): Promise<SafeUser[]> {
  // The backend now paginates this endpoint (default pageSize 20, max 100).
  // HomeScreen has no pagination UI yet, so request the max page size to
  // preserve the previous "show everyone (up to a bound)" behavior rather
  // than silently truncating the chat-contacts list at 20.
  const res = await apiClient.get<ApiEnvelope<SafeUser[]>>('/users', {
    params: { pageSize: 100 },
  });
  return res.data.data;
}

export async function matchContacts(phoneNumbers: string[]): Promise<SafeUser[]> {
  const res = await apiClient.post<ApiEnvelope<SafeUser[]>>('/users/match-contacts', {
    phoneNumbers,
  });
  return res.data.data;
}

export async function updateMyProfile(input: UpdateProfileInput): Promise<SafeUser> {
  const res = await apiClient.patch<ApiEnvelope<SafeUser>>('/users/me', input);
  return res.data.data;
}

export interface PickedImage {
  uri: string;
  name: string;
  type: string;
}

export async function uploadAvatar(image: PickedImage): Promise<SafeUser> {
  const form = new FormData();
  form.append('avatar', {
    uri: image.uri,
    name: image.name,
    type: image.type,
  } as unknown as Blob);
  const res = await apiClient.post<ApiEnvelope<SafeUser>>('/users/me/avatar', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data.data;
}

export type { AvatarAsset };
