import { beforeEach, describe, expect, it, vi } from 'vitest';
import { messageService } from './message.service.js';
import * as messageRepositoryModule from './message.repository.js';
import * as userRepositoryModule from '../auth/user.repository.js';
import { AppError } from '../../errors/AppError.js';

vi.mock('./message.repository.js', () => ({
  messageRepository: {
    create: vi.fn(),
    listConversation: vi.fn(),
  },
}));

vi.mock('../auth/user.repository.js', () => ({
  userRepository: {
    findById: vi.fn(),
  },
}));

const repo = vi.mocked(messageRepositoryModule.messageRepository);
const users = vi.mocked(userRepositoryModule.userRepository);

const stored = {
  id: 'msg-1',
  senderId: 'user-a',
  recipientId: 'user-b',
  ciphertext: 'ct',
  iv: 'iv',
  timestamp: 100,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('messageService.storeMessage', () => {
  const input = {
    senderId: 'user-a',
    recipientId: 'user-b',
    ciphertext: 'ct',
    iv: 'iv',
    timestamp: 100,
  };

  it('stores a message for two existing users', async () => {
    users.findById
      .mockResolvedValueOnce({ _id: 'user-a' } as never)
      .mockResolvedValueOnce({ _id: 'user-b' } as never);
    repo.create.mockResolvedValue({
      _id: { toString: () => 'msg-1' },
      senderId: { toString: () => 'user-a' },
      recipientId: { toString: () => 'user-b' },
      ciphertext: 'ct',
      iv: 'iv',
      timestamp: 100,
    } as never);

    await expect(messageService.storeMessage(input)).resolves.toEqual(stored);
    expect(users.findById).toHaveBeenCalledTimes(2);
    expect(repo.create).toHaveBeenCalledWith(input);
  });

  it('rejects messaging yourself', async () => {
    await expect(messageService.storeMessage({ ...input, recipientId: 'user-a' })).rejects.toThrow(
      AppError,
    );
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('rejects a message to an unknown user', async () => {
    users.findById.mockResolvedValueOnce({ _id: 'user-a' } as never).mockResolvedValueOnce(null);
    await expect(messageService.storeMessage(input)).rejects.toThrow(AppError);
    expect(repo.create).not.toHaveBeenCalled();
  });
});

describe('messageService.listConversation', () => {
  it('lists the conversation for an existing peer', async () => {
    users.findById.mockResolvedValue({ _id: 'user-b' } as never);
    repo.listConversation.mockResolvedValue({
      items: [stored],
      total: 1,
      page: 1,
      pageSize: 20,
    } as never);

    const result = await messageService.listConversation('user-a', 'user-b', 1, 20);
    expect(result.items).toEqual([stored]);
    expect(repo.listConversation).toHaveBeenCalledWith('user-a', 'user-b', 1, 20);
  });

  it('throws 404 when the peer does not exist', async () => {
    users.findById.mockResolvedValue(null);
    await expect(messageService.listConversation('user-a', 'user-b', 1, 20)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(repo.listConversation).not.toHaveBeenCalled();
  });
});
