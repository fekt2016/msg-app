import {
  createChannel,
  listChannels,
  listMyChannels,
  getChannel,
  updateChannel,
  deleteChannel,
  subscribeToChannel,
  unsubscribeFromChannel,
  listChannelSubscribers,
  updateSubscriberRole,
  createInvite,
  listInvites,
  revokeInvite,
  previewInvite,
  joinViaInvite,
  requestToJoin,
  listJoinRequests,
  decideJoinRequest,
  createPost,
  listPosts,
  getPost,
  updatePost,
  deletePost,
  addPostImage,
  setReaction,
  removeReaction,
} from './channels';
import { apiClient } from './client';

jest.mock('./client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    interceptors: {
      request: { use: jest.fn(() => 1), eject: jest.fn() },
      response: { use: jest.fn(() => 2), eject: jest.fn() },
    },
  },
  isApiError: () => false,
  apiErrorMessage: () => 'err',
}));

const mockClient = apiClient as jest.Mocked<typeof apiClient>;

const channel = {
  id: 'ch1',
  name: 'Accra Announcements',
  slug: 'accra-announcements',
  description: 'Official city updates',
  avatar: null,
  visibility: 'PUBLIC' as const,
  ownerId: 'u1',
  subscriberCount: 12,
  postCount: 3,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

const withSubscription = { ...channel, isSubscribed: true, role: 'OWNER' as const };

const pageMeta = { page: 1, pageSize: 20, total: 1, totalPages: 1 };

describe('channels API', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates a channel and unwraps the envelope', async () => {
    mockClient.post.mockResolvedValue({
      data: { success: true, data: { channel, role: 'OWNER' } },
    });

    await expect(
      createChannel({ name: 'Accra Announcements', visibility: 'PUBLIC' }),
    ).resolves.toEqual({ channel, role: 'OWNER' });
    expect(mockClient.post).toHaveBeenCalledWith('/channels', {
      name: 'Accra Announcements',
      visibility: 'PUBLIC',
    });
  });

  it('lists channels and maps pagination meta', async () => {
    mockClient.get.mockResolvedValue({
      data: { success: true, data: [withSubscription], meta: pageMeta },
    });

    await expect(listChannels({ q: 'accra', page: 1, pageSize: 20 })).resolves.toEqual({
      items: [withSubscription],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    expect(mockClient.get).toHaveBeenCalledWith('/channels', {
      params: { q: 'accra', page: 1, pageSize: 20 },
    });
  });

  it('lists my channels without params', async () => {
    mockClient.get.mockResolvedValue({
      data: { success: true, data: [withSubscription], meta: pageMeta },
    });

    await expect(listMyChannels()).resolves.toEqual({
      items: [withSubscription],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    expect(mockClient.get).toHaveBeenCalledWith('/channels/mine');
  });

  it('gets a single channel with subscription info', async () => {
    mockClient.get.mockResolvedValue({ data: { success: true, data: withSubscription } });

    await expect(getChannel('accra-announcements')).resolves.toEqual(withSubscription);
    expect(mockClient.get).toHaveBeenCalledWith('/channels/accra-announcements');
  });

  it('updates a channel', async () => {
    mockClient.patch.mockResolvedValue({ data: { success: true, data: channel } });

    await expect(updateChannel('accra-announcements', { name: 'Accra Updates' })).resolves.toEqual(
      channel,
    );
    expect(mockClient.patch).toHaveBeenCalledWith('/channels/accra-announcements', {
      name: 'Accra Updates',
    });
  });

  it('deletes a channel', async () => {
    mockClient.delete.mockResolvedValue({ data: { success: true, data: null } });

    await expect(deleteChannel('accra-announcements')).resolves.toBeUndefined();
    expect(mockClient.delete).toHaveBeenCalledWith('/channels/accra-announcements');
  });

  it('subscribes to a channel', async () => {
    mockClient.post.mockResolvedValue({ data: { success: true, data: withSubscription } });

    await expect(subscribeToChannel('accra-announcements')).resolves.toEqual(withSubscription);
    expect(mockClient.post).toHaveBeenCalledWith('/channels/accra-announcements/subscribe');
  });

  it('unsubscribes from a channel', async () => {
    mockClient.post.mockResolvedValue({
      data: { success: true, data: { ...withSubscription, isSubscribed: false } },
    });

    await expect(unsubscribeFromChannel('accra-announcements')).resolves.toEqual({
      ...withSubscription,
      isSubscribed: false,
    });
    expect(mockClient.post).toHaveBeenCalledWith('/channels/accra-announcements/unsubscribe');
  });

  it('lists subscribers with pagination meta', async () => {
    const subscriber = {
      channelId: 'ch1',
      userId: 'u2',
      role: 'SUBSCRIBER' as const,
      joinedAt: '2026-08-02T00:00:00.000Z',
      displayName: 'Kofi',
      avatarUrl: null,
    };
    mockClient.get.mockResolvedValue({
      data: { success: true, data: [subscriber], meta: pageMeta },
    });

    await expect(
      listChannelSubscribers('accra-announcements', { page: 1, pageSize: 20 }),
    ).resolves.toEqual({
      items: [subscriber],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    expect(mockClient.get).toHaveBeenCalledWith('/channels/accra-announcements/subscribers', {
      params: { page: 1, pageSize: 20 },
    });
  });

  it('updates a subscriber role', async () => {
    mockClient.patch.mockResolvedValue({ data: { success: true, data: null } });

    await expect(
      updateSubscriberRole('accra-announcements', 'u2', 'ADMIN'),
    ).resolves.toBeUndefined();
    expect(mockClient.patch).toHaveBeenCalledWith('/channels/accra-announcements/subscribers/u2', {
      role: 'ADMIN',
    });
  });

  it('creates an invite and returns the token', async () => {
    const invite = {
      id: 'inv1',
      channelId: 'ch1',
      createdBy: 'u1',
      role: 'SUBSCRIBER' as const,
      expiresAt: '2026-08-08T00:00:00.000Z',
      usedCount: 0,
      maxUses: 10,
      revokedAt: null,
      createdAt: '2026-08-01T00:00:00.000Z',
    };
    mockClient.post.mockResolvedValue({ data: { success: true, data: { token: 'tok', invite } } });

    await expect(createInvite('accra-announcements', { maxUses: 10 })).resolves.toEqual({
      token: 'tok',
      invite,
    });
    expect(mockClient.post).toHaveBeenCalledWith('/channels/accra-announcements/invites', {
      maxUses: 10,
    });
  });

  it('lists invites', async () => {
    const invite = {
      id: 'inv1',
      channelId: 'ch1',
      createdBy: 'u1',
      role: 'SUBSCRIBER' as const,
      expiresAt: '2026-08-08T00:00:00.000Z',
      usedCount: 0,
      maxUses: 10,
      revokedAt: null,
      createdAt: '2026-08-01T00:00:00.000Z',
    };
    mockClient.get.mockResolvedValue({ data: { success: true, data: [invite] } });

    await expect(listInvites('accra-announcements')).resolves.toEqual([invite]);
    expect(mockClient.get).toHaveBeenCalledWith('/channels/accra-announcements/invites');
  });

  it('revokes an invite', async () => {
    mockClient.delete.mockResolvedValue({ data: { success: true, data: null } });

    await expect(revokeInvite('accra-announcements', 'inv1')).resolves.toBeUndefined();
    expect(mockClient.delete).toHaveBeenCalledWith('/channels/accra-announcements/invites/inv1');
  });

  it('previews an invite without auth', async () => {
    const preview = {
      channelName: 'Accra Announcements',
      channelSlug: 'accra-announcements',
      role: 'SUBSCRIBER' as const,
      expiresAt: '2026-08-08T00:00:00.000Z',
    };
    mockClient.get.mockResolvedValue({ data: { success: true, data: preview } });

    await expect(previewInvite('tok')).resolves.toEqual(preview);
    expect(mockClient.get).toHaveBeenCalledWith('/channels/invites/tok');
  });

  it('joins via invite', async () => {
    const result = { channel, role: 'SUBSCRIBER' as const, joined: true, upgraded: false };
    mockClient.post.mockResolvedValue({ data: { success: true, data: result } });

    await expect(joinViaInvite('tok')).resolves.toEqual(result);
    expect(mockClient.post).toHaveBeenCalledWith('/channels/invites/tok/join');
  });

  it('requests to join a private channel', async () => {
    mockClient.post.mockResolvedValue({ data: { success: true, data: null } });

    await expect(requestToJoin('accra-announcements')).resolves.toBeUndefined();
    expect(mockClient.post).toHaveBeenCalledWith('/channels/accra-announcements/requests');
  });

  it('lists join requests with status param', async () => {
    const request = {
      userId: 'u2',
      role: 'SUBSCRIBER' as const,
      status: 'PENDING' as const,
      createdAt: '2026-08-03T00:00:00.000Z',
      decidedAt: null,
      decidedBy: null,
      displayName: 'Kofi',
      avatarUrl: null,
    };
    mockClient.get.mockResolvedValue({ data: { success: true, data: [request], meta: pageMeta } });

    await expect(listJoinRequests('accra-announcements', 'PENDING')).resolves.toEqual({
      items: [request],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    expect(mockClient.get).toHaveBeenCalledWith('/channels/accra-announcements/requests', {
      params: { status: 'PENDING' },
    });
  });

  it('decides a join request', async () => {
    mockClient.patch.mockResolvedValue({ data: { success: true, data: null } });

    await expect(
      decideJoinRequest('accra-announcements', 'u2', 'APPROVE'),
    ).resolves.toBeUndefined();
    expect(mockClient.patch).toHaveBeenCalledWith('/channels/accra-announcements/requests/u2', {
      action: 'APPROVE',
    });
  });

  it('creates a post', async () => {
    const post = {
      id: 'p1',
      channelId: 'ch1',
      authorId: 'u1',
      body: 'Hello',
      images: [],
      reactionCounts: {},
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
      author: { displayName: 'Ama', avatarUrl: null },
    };
    mockClient.post.mockResolvedValue({ data: { success: true, data: post } });

    await expect(createPost('accra-announcements', 'Hello')).resolves.toEqual(post);
    expect(mockClient.post).toHaveBeenCalledWith('/channels/accra-announcements/posts', {
      body: 'Hello',
    });
  });

  it('lists posts with a cursor', async () => {
    mockClient.get.mockResolvedValue({
      data: { success: true, data: [], meta: { nextCursor: 'cur2' } },
    });

    await expect(listPosts('accra-announcements', { limit: 20, cursor: 'cur1' })).resolves.toEqual({
      items: [],
      nextCursor: 'cur2',
    });
    expect(mockClient.get).toHaveBeenCalledWith('/channels/accra-announcements/posts', {
      params: { limit: 20, cursor: 'cur1' },
    });
  });

  it('defaults to no cursor param when none provided', async () => {
    mockClient.get.mockResolvedValue({
      data: { success: true, data: [], meta: { nextCursor: null } },
    });

    await expect(listPosts('accra-announcements', { limit: 20 })).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
    expect(mockClient.get).toHaveBeenCalledWith('/channels/accra-announcements/posts', {
      params: { limit: 20 },
    });
  });

  it('gets a single post', async () => {
    const post = {
      id: 'p1',
      channelId: 'ch1',
      authorId: 'u1',
      body: 'Hello',
      images: [],
      reactionCounts: {},
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
      author: { displayName: 'Ama', avatarUrl: null },
    };
    mockClient.get.mockResolvedValue({ data: { success: true, data: post } });

    await expect(getPost('accra-announcements', 'p1')).resolves.toEqual(post);
    expect(mockClient.get).toHaveBeenCalledWith('/channels/accra-announcements/posts/p1');
  });

  it('updates a post', async () => {
    const post = {
      id: 'p1',
      channelId: 'ch1',
      authorId: 'u1',
      body: 'Updated',
      images: [],
      reactionCounts: {},
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
      author: { displayName: 'Ama', avatarUrl: null },
    };
    mockClient.patch.mockResolvedValue({ data: { success: true, data: post } });

    await expect(updatePost('accra-announcements', 'p1', 'Updated')).resolves.toEqual(post);
    expect(mockClient.patch).toHaveBeenCalledWith('/channels/accra-announcements/posts/p1', {
      body: 'Updated',
    });
  });

  it('deletes a post', async () => {
    mockClient.delete.mockResolvedValue({ data: { success: true, data: null } });

    await expect(deletePost('accra-announcements', 'p1')).resolves.toBeUndefined();
    expect(mockClient.delete).toHaveBeenCalledWith('/channels/accra-announcements/posts/p1');
  });

  it('uploads a post image via multipart form data', async () => {
    const post = {
      id: 'p1',
      channelId: 'ch1',
      authorId: 'u1',
      body: '',
      images: [],
      reactionCounts: {},
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
      author: { displayName: 'Ama', avatarUrl: null },
    };
    mockClient.post.mockResolvedValue({ data: { success: true, data: post } });

    const form = new FormData();
    form.append('image', {
      uri: 'file:///a.jpg',
      name: 'a.jpg',
      type: 'image/jpeg',
    } as unknown as Blob);

    await expect(
      addPostImage('accra-announcements', 'p1', {
        uri: 'file:///a.jpg',
        name: 'a.jpg',
        type: 'image/jpeg',
      }),
    ).resolves.toEqual(post);
    expect(mockClient.post).toHaveBeenCalledWith(
      '/channels/accra-announcements/posts/p1/images',
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
  });

  it('sets a reaction and returns the counts', async () => {
    mockClient.put.mockResolvedValue({
      data: { success: true, data: { reactionCounts: { '👍': 2 } } },
    });

    await expect(setReaction('accra-announcements', 'p1', '👍')).resolves.toEqual({ '👍': 2 });
    expect(mockClient.put).toHaveBeenCalledWith('/channels/accra-announcements/posts/p1/reaction', {
      emoji: '👍',
    });
  });

  it('removes a reaction and returns the counts', async () => {
    mockClient.delete.mockResolvedValue({
      data: { success: true, data: { reactionCounts: {} } },
    });

    await expect(removeReaction('accra-announcements', 'p1')).resolves.toEqual({});
    expect(mockClient.delete).toHaveBeenCalledWith(
      '/channels/accra-announcements/posts/p1/reaction',
    );
  });
});
