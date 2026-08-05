import { apiClient } from './client';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  meta?: { page: number; pageSize: number; total: number; totalPages: number };
}

export type GroupRole = 'OWNER' | 'MEMBER';

export interface AvatarAsset {
  publicId: string;
  url: string;
  width: number;
  height: number;
}

export interface Group {
  id: string;
  name: string;
  avatar: AvatarAsset | null;
  ownerId: string;
  memberCount: number;
  role: GroupRole;
  createdAt: string;
  updatedAt: string;
}

export interface GroupMember {
  groupId: string;
  userId: string;
  role: GroupRole;
  joinedAt: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateGroupInput {
  name: string;
  memberIds?: string[];
}

export async function createGroup(input: CreateGroupInput): Promise<Group> {
  const res = await apiClient.post<ApiEnvelope<Group>>('/groups', input);
  return res.data.data;
}

export async function listGroups(): Promise<Group[]> {
  const res = await apiClient.get<ApiEnvelope<Group[]>>('/groups');
  return res.data.data;
}

export async function getGroup(groupId: string): Promise<Group> {
  const res = await apiClient.get<ApiEnvelope<Group>>(`/groups/${groupId}`);
  return res.data.data;
}

export async function listGroupMembers(
  groupId: string,
  params: { page?: number; pageSize?: number } = {},
): Promise<Paginated<GroupMember>> {
  const res = await apiClient.get<ApiEnvelope<GroupMember[]>>(`/groups/${groupId}/members`, {
    params,
  });
  const meta = res.data.meta!;
  return { items: res.data.data, total: meta.total, page: meta.page, pageSize: meta.pageSize };
}

export async function addGroupMembers(
  groupId: string,
  memberIds: string[],
): Promise<{ added: string[] }> {
  const res = await apiClient.post<ApiEnvelope<{ added: string[] }>>(`/groups/${groupId}/members`, {
    memberIds,
  });
  return res.data.data;
}

export async function removeGroupMember(groupId: string, userId: string): Promise<void> {
  await apiClient.delete(`/groups/${groupId}/members/${userId}`);
}

export async function leaveGroup(groupId: string): Promise<void> {
  await apiClient.post(`/groups/${groupId}/leave`);
}

export async function deleteGroup(groupId: string): Promise<void> {
  await apiClient.delete(`/groups/${groupId}`);
}
