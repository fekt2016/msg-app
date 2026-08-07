import { beforeEach, describe, expect, it, vi } from 'vitest';
import { groupMessageService } from './groupMessage.service.js';
import * as groupMessageRepositoryModule from './groupMessage.repository.js';
import * as groupRepositoryModule from '../groups/group.repository.js';

vi.mock('./groupMessage.repository.js', () => ({
  groupMessageRepository: {
    create: vi.fn(),
    listByGroup: vi.fn(),
  },
}));

vi.mock('../groups/group.repository.js', () => ({
  groupRepository: {
    findById: vi.fn(),
    findMember: vi.fn(),
  },
}));

const repo = vi.mocked(groupMessageRepositoryModule.groupMessageRepository);
const groups = vi.mocked(groupRepositoryModule.groupRepository);

const stored = {
  id: 'gm-1',
  groupId: 'group-1',
  senderId: 'user-a',
  keyId: 3,
  ciphertext: 'ct',
  iv: 'iv',
  timestamp: 100,
};

const input = {
  groupId: 'group-1',
  senderId: 'user-a',
  keyId: 3,
  ciphertext: 'ct',
  iv: 'iv',
  timestamp: 100,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('groupMessageService.storeMessage', () => {
  it('stores a message for a member of the group', async () => {
    groups.findMember.mockResolvedValue({ userId: 'user-a' } as never);
    repo.create.mockResolvedValue({
      _id: { toString: () => 'gm-1' },
      groupId: { toString: () => 'group-1' },
      senderId: { toString: () => 'user-a' },
      keyId: 3,
      ciphertext: 'ct',
      iv: 'iv',
      timestamp: 100,
    } as never);

    await expect(groupMessageService.storeMessage(input)).resolves.toEqual(stored);
    expect(groups.findMember).toHaveBeenCalledWith('group-1', 'user-a');
    expect(repo.create).toHaveBeenCalledWith(input);
  });

  it('rejects a message from a non-member', async () => {
    groups.findMember.mockResolvedValue(null);
    await expect(groupMessageService.storeMessage(input)).rejects.toMatchObject({
      statusCode: 403,
      code: 'NOT_GROUP_MEMBER',
    });
    expect(repo.create).not.toHaveBeenCalled();
  });
});

describe('groupMessageService.listGroupMessages', () => {
  it('lists history for an existing group member, scoped to their join time', async () => {
    const joinedAt = new Date('2026-02-03T00:00:00.000Z');
    groups.findById.mockResolvedValue({ _id: 'group-1' } as never);
    groups.findMember.mockResolvedValue({ userId: 'viewer', joinedAt } as never);
    repo.listByGroup.mockResolvedValue({
      items: [stored],
      total: 1,
      page: 1,
      pageSize: 20,
    } as never);

    const result = await groupMessageService.listGroupMessages('viewer', 'group-1', 1, 20);
    expect(result.items).toEqual([stored]);
    // Forward-only (ADR 0004): the caller's joinedAt is the history cutoff.
    expect(repo.listByGroup).toHaveBeenCalledWith('group-1', 1, 20, joinedAt);
  });

  it('throws 404 when the group does not exist', async () => {
    groups.findById.mockResolvedValue(null);
    await expect(
      groupMessageService.listGroupMessages('viewer', 'group-1', 1, 20),
    ).rejects.toMatchObject({ statusCode: 404, code: 'GROUP_NOT_FOUND' });
    expect(repo.listByGroup).not.toHaveBeenCalled();
  });

  it('throws 403 when the viewer is not a member', async () => {
    groups.findById.mockResolvedValue({ _id: 'group-1' } as never);
    groups.findMember.mockResolvedValue(null);
    await expect(
      groupMessageService.listGroupMessages('viewer', 'group-1', 1, 20),
    ).rejects.toMatchObject({ statusCode: 403, code: 'NOT_GROUP_MEMBER' });
    expect(repo.listByGroup).not.toHaveBeenCalled();
  });
});
