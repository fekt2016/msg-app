import { apiClient } from './client';
import type { AvatarAsset } from './auth';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  meta?: { page: number; pageSize: number; total: number; totalPages: number };
}

export type CommunityVisibility = 'PUBLIC' | 'PRIVATE';
export type MemberRole = 'OWNER' | 'MODERATOR' | 'MEMBER';

export interface Community {
  id: string;
  name: string;
  slug: string;
  description: string;
  avatar: AvatarAsset | null;
  visibility: CommunityVisibility;
  ownerId: string;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CommunityWithMembership extends Community {
  isMember: boolean;
  role: MemberRole | null;
}

export interface CommunityMember {
  communityId: string;
  userId: string;
  role: MemberRole;
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

export interface CreateCommunityInput {
  name: string;
  description?: string;
  visibility?: CommunityVisibility;
}

export async function createCommunity(input: CreateCommunityInput): Promise<{
  community: Community;
  role: MemberRole;
}> {
  const res = await apiClient.post<ApiEnvelope<{ community: Community; role: MemberRole }>>(
    '/communities',
    input,
  );
  return res.data.data;
}

export async function listCommunities(
  params: {
    q?: string;
    page?: number;
    pageSize?: number;
  } = {},
): Promise<Paginated<Community>> {
  const res = await apiClient.get<ApiEnvelope<Community[]>>('/communities', { params });
  const meta = res.data.meta!;
  return { items: res.data.data, total: meta.total, page: meta.page, pageSize: meta.pageSize };
}

export async function getCommunity(identifier: string): Promise<CommunityWithMembership> {
  const res = await apiClient.get<ApiEnvelope<CommunityWithMembership>>(
    `/communities/${identifier}`,
  );
  return res.data.data;
}

export async function updateCommunity(
  identifier: string,
  input: { name?: string; description?: string; visibility?: CommunityVisibility },
): Promise<Community> {
  const res = await apiClient.patch<ApiEnvelope<Community>>(`/communities/${identifier}`, input);
  return res.data.data;
}

export async function deleteCommunity(identifier: string): Promise<void> {
  await apiClient.delete(`/communities/${identifier}`);
}

export async function joinCommunity(identifier: string): Promise<CommunityWithMembership> {
  const res = await apiClient.post<ApiEnvelope<CommunityWithMembership>>(
    `/communities/${identifier}/join`,
  );
  return res.data.data;
}

export async function leaveCommunity(identifier: string): Promise<CommunityWithMembership> {
  const res = await apiClient.post<ApiEnvelope<CommunityWithMembership>>(
    `/communities/${identifier}/leave`,
  );
  return res.data.data;
}

export async function listCommunityMembers(
  identifier: string,
  params: { page?: number; pageSize?: number } = {},
): Promise<Paginated<CommunityMember>> {
  const res = await apiClient.get<ApiEnvelope<CommunityMember[]>>(
    `/communities/${identifier}/members`,
    { params },
  );
  const meta = res.data.meta!;
  return { items: res.data.data, total: meta.total, page: meta.page, pageSize: meta.pageSize };
}

export async function updateMemberRole(
  identifier: string,
  userId: string,
  role: Exclude<MemberRole, 'OWNER'>,
): Promise<void> {
  await apiClient.patch(`/communities/${identifier}/members/${userId}`, { role });
}
