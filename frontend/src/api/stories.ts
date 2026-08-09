import { apiClient } from './client';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  meta?: Record<string, unknown>;
}

export type StoryMediaType = 'IMAGE' | 'VIDEO';

export interface StoryMedia {
  publicId: string;
  url: string;
  width?: number;
  height?: number;
  resourceType: StoryMediaType;
  durationMs?: number;
}

export interface Story {
  id: string;
  authorId: string;
  media: StoryMedia;
  caption: string;
  expiresAt: string;
  createdAt: string;
  hasViewed: boolean;
  /** Author-only — absent for any other viewer (privacy). */
  viewCount?: number;
}

export interface StoryFeedItem {
  author: { id: string; displayName: string; avatarUrl: string | null };
  stories: Story[];
  latestAt: string;
}

export interface StoryViewer {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  viewedAt: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PickedMedia {
  uri: string;
  name: string;
  type: string;
}

export async function createStory(media: PickedMedia, caption?: string): Promise<Story> {
  const form = new FormData();
  form.append('media', {
    uri: media.uri,
    name: media.name,
    type: media.type,
  } as unknown as Blob);
  if (caption) {
    form.append('caption', caption);
  }
  const res = await apiClient.post<ApiEnvelope<Story>>('/stories', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data.data;
}

export async function listStoryFeed(
  params: { page?: number; pageSize?: number } = {},
): Promise<Paginated<StoryFeedItem>> {
  const res = await apiClient.get<ApiEnvelope<StoryFeedItem[]>>('/stories/feed', { params });
  return paginated(res.data.data, res.data.meta);
}

export async function getStory(storyId: string): Promise<Story> {
  const res = await apiClient.get<ApiEnvelope<Story>>(`/stories/${storyId}`);
  return res.data.data;
}

export async function deleteStory(storyId: string): Promise<void> {
  await apiClient.delete(`/stories/${storyId}`);
}

export async function markStoryViewed(storyId: string): Promise<{ viewed: boolean }> {
  const res = await apiClient.post<ApiEnvelope<{ viewed: boolean }>>(`/stories/${storyId}/views`);
  return res.data.data;
}

export async function listStoryViewers(
  storyId: string,
  params: { page?: number; pageSize?: number } = {},
): Promise<Paginated<StoryViewer>> {
  const res = await apiClient.get<ApiEnvelope<StoryViewer[]>>(`/stories/${storyId}/views`, {
    params,
  });
  return paginated(res.data.data, res.data.meta);
}

function paginated<T>(items: T[], meta?: Record<string, unknown>): Paginated<T> {
  return {
    items,
    total: (meta?.total as number) ?? 0,
    page: (meta?.page as number) ?? 1,
    pageSize: (meta?.pageSize as number) ?? items.length,
  };
}
