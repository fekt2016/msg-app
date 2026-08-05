import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./message.model.js', () => ({
  ConversationMessageModel: {
    create: vi.fn(),
    find: vi.fn(),
    countDocuments: vi.fn(),
  },
}));

import { ConversationMessageModel } from './message.model.js';
import { messageRepository } from './message.repository.js';

const mockModel = vi.mocked(ConversationMessageModel) as unknown as {
  create: ReturnType<typeof vi.fn>;
  find: ReturnType<typeof vi.fn>;
  countDocuments: ReturnType<typeof vi.fn>;
};

/** Builds a query stub whose `.exec()` resolves to `result`. */
function execChain(result: unknown) {
  return { exec: vi.fn().mockResolvedValue(result) };
}

function doc(overrides = {}) {
  return {
    _id: { toString: () => 'msg-1' },
    senderId: { toString: () => 'user-a' },
    recipientId: { toString: () => 'user-b' },
    ciphertext: 'ct',
    iv: 'iv',
    timestamp: 100,
    ...overrides,
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('messageRepository.create', () => {
  it('creates a stored message', async () => {
    mockModel.create.mockResolvedValue(doc());
    const input = {
      senderId: 'user-a',
      recipientId: 'user-b',
      ciphertext: 'ct',
      iv: 'iv',
      timestamp: 100,
    };

    await expect(messageRepository.create(input)).resolves.toBeDefined();
    expect(mockModel.create).toHaveBeenCalledWith(input);
  });
});

describe('messageRepository.listConversation', () => {
  it('queries both directions, newest first, with pagination', async () => {
    mockModel.find.mockReturnValue({
      sort: () => ({
        skip: () => ({
          limit: () => execChain([doc()]),
        }),
      }),
    });
    mockModel.countDocuments.mockResolvedValue(1);

    const result = await messageRepository.listConversation('user-a', 'user-b', 1, 20);

    expect(mockModel.find).toHaveBeenCalledWith({
      $or: [
        { senderId: 'user-a', recipientId: 'user-b' },
        { senderId: 'user-b', recipientId: 'user-a' },
      ],
    });
    expect(mockModel.countDocuments).toHaveBeenCalledWith({
      $or: [
        { senderId: 'user-a', recipientId: 'user-b' },
        { senderId: 'user-b', recipientId: 'user-a' },
      ],
    });
    expect(result).toEqual({
      items: [
        {
          id: 'msg-1',
          senderId: 'user-a',
          recipientId: 'user-b',
          ciphertext: 'ct',
          iv: 'iv',
          timestamp: 100,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    });
  });

  it('returns an empty page when there are no messages', async () => {
    mockModel.find.mockReturnValue({
      sort: () => ({
        skip: () => ({
          limit: () => execChain([]),
        }),
      }),
    });
    mockModel.countDocuments.mockResolvedValue(0);

    const result = await messageRepository.listConversation('user-a', 'user-b', 1, 20);
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });
});
