import {
  createStory,
  listStoryFeed,
  getStory,
  deleteStory,
  markStoryViewed,
  listStoryViewers,
} from './stories';
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

const story = {
  id: 's1',
  authorId: 'u1',
  media: {
    publicId: 'story-1',
    url: 'https://cdn.test/s1.png',
    width: 720,
    height: 1280,
    resourceType: 'IMAGE' as const,
  },
  caption: 'Hello stories',
  expiresAt: '2026-01-02T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  hasViewed: false,
};

const envelope = <T>(data: T, meta?: Record<string, unknown>) => ({
  success: true,
  data,
  meta,
});

describe('stories api', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a story with multipart form data', async () => {
    mockClient.post.mockResolvedValue({ data: envelope(story) });

    const result = await createStory(
      { uri: 'file:///tmp/s.jpg', name: 's.jpg', type: 'image/jpeg' },
      'Hello stories',
    );

    expect(result.id).toBe('s1');
    const [, form, config] = mockClient.post.mock.calls[0] as unknown as [
      string,
      FormData,
      { headers: Record<string, string> },
    ];
    expect(form).toBeInstanceOf(FormData);
    expect(config.headers['Content-Type']).toBe('multipart/form-data');
  });

  it('creates a story without a caption', async () => {
    mockClient.post.mockResolvedValue({ data: envelope(story) });

    const result = await createStory({
      uri: 'file:///tmp/s.mp4',
      name: 's.mp4',
      type: 'video/mp4',
    });

    expect(mockClient.post).toHaveBeenCalledWith(
      '/stories',
      expect.any(FormData),
      expect.anything(),
    );
    expect(result.id).toBe('s1');
  });

  it('lists the feed with pagination meta', async () => {
    mockClient.get.mockResolvedValue({
      data: envelope(
        [
          {
            author: { id: 'u1', displayName: 'Ama', avatarUrl: null },
            stories: [story],
            latestAt: story.createdAt,
          },
        ],
        {
          page: 1,
          pageSize: 20,
          total: 1,
          totalPages: 1,
        },
      ),
    });

    const result = await listStoryFeed({ page: 1, pageSize: 20 });

    expect(mockClient.get).toHaveBeenCalledWith('/stories/feed', {
      params: { page: 1, pageSize: 20 },
    });
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
  });

  it('gets a single story', async () => {
    mockClient.get.mockResolvedValue({ data: envelope(story) });

    const result = await getStory('s1');

    expect(mockClient.get).toHaveBeenCalledWith('/stories/s1');
    expect(result.id).toBe('s1');
  });

  it('deletes a story', async () => {
    mockClient.delete.mockResolvedValue({ data: envelope({ deleted: true }) });

    await deleteStory('s1');

    expect(mockClient.delete).toHaveBeenCalledWith('/stories/s1');
  });

  it('marks a story viewed', async () => {
    mockClient.post.mockResolvedValue({ data: envelope({ viewed: true }) });

    const result = await markStoryViewed('s1');

    expect(mockClient.post).toHaveBeenCalledWith('/stories/s1/views');
    expect(result.viewed).toBe(true);
  });

  it('lists story viewers with meta', async () => {
    mockClient.get.mockResolvedValue({
      data: envelope(
        [
          {
            userId: 'u2',
            displayName: 'Kofi',
            avatarUrl: null,
            viewedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      ),
    });

    const result = await listStoryViewers('s1', { page: 1, pageSize: 20 });

    expect(mockClient.get).toHaveBeenCalledWith('/stories/s1/views', {
      params: { page: 1, pageSize: 20 },
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].displayName).toBe('Kofi');
  });
});
