import { apiClient } from './client';
import type { AvatarAsset } from './auth';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  meta?: Record<string, unknown>;
}

export type ChannelVisibility = 'PUBLIC' | 'PRIVATE';
export type ChannelRole = 'OWNER' | 'ADMIN' | 'SUBSCRIBER';

export const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export interface Channel {
  id: string;
  name: string;
  slug: string;
  description: string;
  avatar: AvatarAsset | null;
  visibility: ChannelVisibility;
  ownerId: string;
  subscriberCount: number;
  postCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChannelWithSubscription extends Channel {
  isSubscribed: boolean;
  role: ChannelRole | null;
}

export interface ChannelSubscriber {
  channelId: string;
  userId: string;
  role: ChannelRole;
  joinedAt: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface ChannelPost {
  id: string;
  channelId: string;
  authorId: string;
  body: string;
  images: { publicId: string; url: string; alt: string; order: number }[];
  reactionCounts: Record<string, number>;
  createdAt: string;
  updatedAt: string;
  author: { displayName: string; avatarUrl: string | null };
}

export interface ChannelInvite {
  id: string;
  channelId: string;
  createdBy: string;
  role: Exclude<ChannelRole, 'OWNER'>;
  expiresAt: string;
  usedCount: number;
  maxUses: number;
  revokedAt: string | null;
  createdAt: string;
}

export interface JoinRequest {
  userId: string;
  role: ChannelRole;
  status: 'PENDING' | 'APPROVED' | 'DENIED';
  createdAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  displayName: string;
  avatarUrl: string | null;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Cursor-paginated feed (documented deviation from the offset meta shape). */
export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface CreateChannelInput {
  name: string;
  description?: string;
  visibility?: ChannelVisibility;
}

export interface PickedImage {
  uri: string;
  name: string;
  type: string;
}

export async function createChannel(input: CreateChannelInput): Promise<{
  channel: Channel;
  role: ChannelRole;
}> {
  const res = await apiClient.post<ApiEnvelope<{ channel: Channel; role: ChannelRole }>>(
    '/channels',
    input,
  );
  return res.data.data;
}

export async function listChannels(
  params: { q?: string; page?: number; pageSize?: number } = {},
): Promise<Paginated<ChannelWithSubscription>> {
  const res = await apiClient.get<ApiEnvelope<ChannelWithSubscription[]>>('/channels', {
    params,
  });
  return paginated(res.data.data, res.data.meta);
}

export async function listMyChannels(): Promise<Paginated<ChannelWithSubscription>> {
  const res = await apiClient.get<ApiEnvelope<ChannelWithSubscription[]>>('/channels/mine');
  return paginated(res.data.data, res.data.meta);
}

export async function getChannel(identifier: string): Promise<ChannelWithSubscription> {
  const res = await apiClient.get<ApiEnvelope<ChannelWithSubscription>>(`/channels/${identifier}`);
  return res.data.data;
}

export async function updateChannel(
  identifier: string,
  input: Partial<CreateChannelInput>,
): Promise<Channel> {
  const res = await apiClient.patch<ApiEnvelope<Channel>>(`/channels/${identifier}`, input);
  return res.data.data;
}

export async function deleteChannel(identifier: string): Promise<void> {
  await apiClient.delete(`/channels/${identifier}`);
}

export async function subscribeToChannel(identifier: string): Promise<ChannelWithSubscription> {
  const res = await apiClient.post<ApiEnvelope<ChannelWithSubscription>>(
    `/channels/${identifier}/subscribe`,
  );
  return res.data.data;
}

export async function unsubscribeFromChannel(identifier: string): Promise<ChannelWithSubscription> {
  const res = await apiClient.post<ApiEnvelope<ChannelWithSubscription>>(
    `/channels/${identifier}/unsubscribe`,
  );
  return res.data.data;
}

export async function listChannelSubscribers(
  identifier: string,
  params: { page?: number; pageSize?: number } = {},
): Promise<Paginated<ChannelSubscriber>> {
  const res = await apiClient.get<ApiEnvelope<ChannelSubscriber[]>>(
    `/channels/${identifier}/subscribers`,
    { params },
  );
  return paginated(res.data.data, res.data.meta);
}

export async function updateSubscriberRole(
  identifier: string,
  userId: string,
  role: Exclude<ChannelRole, 'OWNER'>,
): Promise<void> {
  await apiClient.patch(`/channels/${identifier}/subscribers/${userId}`, { role });
}

export async function createInvite(
  identifier: string,
  input: { role?: Exclude<ChannelRole, 'OWNER'>; expiresInDays?: number; maxUses?: number } = {},
): Promise<{ token: string; invite: ChannelInvite }> {
  const res = await apiClient.post<ApiEnvelope<{ token: string; invite: ChannelInvite }>>(
    `/channels/${identifier}/invites`,
    input,
  );
  return res.data.data;
}

export async function listInvites(identifier: string): Promise<ChannelInvite[]> {
  const res = await apiClient.get<ApiEnvelope<ChannelInvite[]>>(`/channels/${identifier}/invites`);
  return res.data.data;
}

export async function revokeInvite(identifier: string, inviteId: string): Promise<void> {
  await apiClient.delete(`/channels/${identifier}/invites/${inviteId}`);
}

export async function previewInvite(token: string): Promise<{
  channelName: string;
  channelSlug: string;
  role: Exclude<ChannelRole, 'OWNER'>;
  expiresAt: string;
}> {
  const res = await apiClient.get<
    ApiEnvelope<{
      channelName: string;
      channelSlug: string;
      role: Exclude<ChannelRole, 'OWNER'>;
      expiresAt: string;
    }>
  >(`/channels/invites/${token}`);
  return res.data.data;
}

export async function joinViaInvite(token: string): Promise<{
  channel: Channel;
  role: ChannelRole;
  joined: boolean;
  upgraded: boolean;
}> {
  const res = await apiClient.post<
    ApiEnvelope<{
      channel: Channel;
      role: ChannelRole;
      joined: boolean;
      upgraded: boolean;
    }>
  >(`/channels/invites/${token}/join`);
  return res.data.data;
}

export async function requestToJoin(identifier: string): Promise<void> {
  await apiClient.post(`/channels/${identifier}/requests`);
}

export async function listJoinRequests(
  identifier: string,
  status: 'PENDING' | 'APPROVED' | 'DENIED' = 'PENDING',
): Promise<Paginated<JoinRequest>> {
  const res = await apiClient.get<ApiEnvelope<JoinRequest[]>>(`/channels/${identifier}/requests`, {
    params: { status },
  });
  return paginated(res.data.data, res.data.meta);
}

export async function decideJoinRequest(
  identifier: string,
  userId: string,
  action: 'APPROVE' | 'DENY',
): Promise<void> {
  await apiClient.patch(`/channels/${identifier}/requests/${userId}`, { action });
}

export async function createPost(identifier: string, body: string): Promise<ChannelPost> {
  const res = await apiClient.post<ApiEnvelope<ChannelPost>>(`/channels/${identifier}/posts`, {
    body,
  });
  return res.data.data;
}

export async function listPosts(
  identifier: string,
  params: { limit?: number; cursor?: string | null } = {},
): Promise<CursorPage<ChannelPost>> {
  const query: { limit?: number; cursor?: string } = {};
  if (params.limit !== undefined) query.limit = params.limit;
  if (params.cursor) query.cursor = params.cursor;
  const res = await apiClient.get<ApiEnvelope<ChannelPost[]>>(`/channels/${identifier}/posts`, {
    params: query,
  });
  return { items: res.data.data, nextCursor: (res.data.meta?.nextCursor as string | null) ?? null };
}

export async function getPost(identifier: string, postId: string): Promise<ChannelPost> {
  const res = await apiClient.get<ApiEnvelope<ChannelPost>>(
    `/channels/${identifier}/posts/${postId}`,
  );
  return res.data.data;
}

export async function updatePost(
  identifier: string,
  postId: string,
  body: string,
): Promise<ChannelPost> {
  const res = await apiClient.patch<ApiEnvelope<ChannelPost>>(
    `/channels/${identifier}/posts/${postId}`,
    { body },
  );
  return res.data.data;
}

export async function deletePost(identifier: string, postId: string): Promise<void> {
  await apiClient.delete(`/channels/${identifier}/posts/${postId}`);
}

export async function addPostImage(
  identifier: string,
  postId: string,
  image: PickedImage,
): Promise<ChannelPost> {
  const form = new FormData();
  form.append('image', {
    uri: image.uri,
    name: image.name,
    type: image.type,
  } as unknown as Blob);
  const res = await apiClient.post<ApiEnvelope<ChannelPost>>(
    `/channels/${identifier}/posts/${postId}/images`,
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return res.data.data;
}

export async function setReaction(
  identifier: string,
  postId: string,
  emoji: ReactionEmoji,
): Promise<Record<string, number>> {
  const res = await apiClient.put<ApiEnvelope<{ reactionCounts: Record<string, number> }>>(
    `/channels/${identifier}/posts/${postId}/reaction`,
    { emoji },
  );
  return res.data.data.reactionCounts;
}

export async function removeReaction(
  identifier: string,
  postId: string,
): Promise<Record<string, number>> {
  const res = await apiClient.delete<ApiEnvelope<{ reactionCounts: Record<string, number> }>>(
    `/channels/${identifier}/posts/${postId}/reaction`,
  );
  return res.data.data.reactionCounts;
}

function paginated<T>(items: T[], meta?: Record<string, unknown>): Paginated<T> {
  return {
    items,
    total: (meta?.total as number) ?? 0,
    page: (meta?.page as number) ?? 1,
    pageSize: (meta?.pageSize as number) ?? items.length,
  };
}
