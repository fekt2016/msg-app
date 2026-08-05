import { beforeEach, describe, expect, it, vi } from 'vitest';
import { groupKeyService } from './groupKey.service.js';
import * as groupSenderKeyRepositoryModule from './groupSenderKey.repository.js';
import * as groupRepositoryModule from '../groups/group.repository.js';

vi.mock('./groupSenderKey.repository.js', () => ({
  groupSenderKeyRepository: {
    find: vi.fn(),
    upsertEnvelopes: vi.fn(),
    findEnvelopeForRecipient: vi.fn(),
    listSendersForRecipient: vi.fn(),
    deleteSenderKey: vi.fn(),
    deleteByGroup: vi.fn(),
  },
}));

vi.mock('../groups/group.repository.js', () => ({
  groupRepository: {
    listMemberIds: vi.fn(),
  },
}));

const repo = vi.mocked(groupSenderKeyRepositoryModule.groupSenderKeyRepository);
const groups = vi.mocked(groupRepositoryModule.groupRepository);

const GROUP = '5f5f5f5f5f5f5f5f5f5f5f5f';

function envelope(recipientId: string) {
  return {
    recipientId,
    keyId: 3,
    ciphertext: 'ciphertext',
    iv: 'iv',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('groupKeyService.uploadSenderKeys', () => {
  it('stores deduplicated envelopes for fellow members', async () => {
    groups.listMemberIds.mockResolvedValue(['user-1', 'user-2', 'user-3']);
    repo.upsertEnvelopes.mockResolvedValue({} as never);

    const result = await groupKeyService.uploadSenderKeys(GROUP, 'user-1', [
      envelope('user-2'),
      envelope('user-3'),
      envelope('user-2'),
    ]);

    expect(repo.upsertEnvelopes).toHaveBeenCalledWith(
      GROUP,
      'user-1',
      expect.arrayContaining([
        expect.objectContaining({ recipientId: 'user-2' }),
        expect.objectContaining({ recipientId: 'user-3' }),
      ]),
    );
    expect(result).toHaveLength(2);
  });

  it('rejects a non-member uploading into the group', async () => {
    groups.listMemberIds.mockResolvedValue(['user-1', 'user-2']);

    await expect(
      groupKeyService.uploadSenderKeys(GROUP, 'intruder', [envelope('user-2')]),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: 'NOT_GROUP_MEMBER',
    });
    expect(repo.upsertEnvelopes).not.toHaveBeenCalled();
  });

  it('rejects an envelope targeting the sender themselves', async () => {
    groups.listMemberIds.mockResolvedValue(['user-1', 'user-2']);
    await expect(
      groupKeyService.uploadSenderKeys(GROUP, 'user-1', [envelope('user-1')]),
    ).rejects.toMatchObject({
      statusCode: 422,
      code: 'SELF_RECIPIENT',
    });
    expect(repo.upsertEnvelopes).not.toHaveBeenCalled();
  });

  it('rejects envelopes addressed to a non-member', async () => {
    groups.listMemberIds.mockResolvedValue(['user-1', 'user-2']);

    await expect(
      groupKeyService.uploadSenderKeys(GROUP, 'user-1', [envelope('user-2'), envelope('ghost')]),
    ).rejects.toMatchObject({
      statusCode: 422,
      code: 'UNKNOWN_RECIPIENT',
    });
    expect(repo.upsertEnvelopes).not.toHaveBeenCalled();
  });
});

describe('groupKeyService.getSenderKey', () => {
  it('returns the envelope addressed to the recipient', async () => {
    repo.findEnvelopeForRecipient.mockResolvedValue({
      recipientId: 'user-2',
      keyId: 3,
      ciphertext: 'ciphertext',
      iv: 'iv',
      createdAt: new Date(),
    });

    const result = await groupKeyService.getSenderKey(GROUP, 'user-1', 'user-2');

    expect(repo.findEnvelopeForRecipient).toHaveBeenCalledWith(GROUP, 'user-1', 'user-2');
    expect(result.recipientId).toBe('user-2');
  });

  it('throws 404 when no envelope exists for the recipient', async () => {
    repo.findEnvelopeForRecipient.mockResolvedValue(null);

    await expect(groupKeyService.getSenderKey(GROUP, 'user-1', 'user-2')).rejects.toMatchObject({
      statusCode: 404,
      code: 'SENDER_KEY_NOT_FOUND',
    });
  });
});

describe('groupKeyService.listSenderKeys', () => {
  it('lists senders that distributed a key to the recipient', async () => {
    repo.listSendersForRecipient.mockResolvedValue([
      { senderId: 'user-1', keyId: 3, updatedAt: new Date() },
    ]);

    const result = await groupKeyService.listSenderKeys(GROUP, 'user-2');

    expect(repo.listSendersForRecipient).toHaveBeenCalledWith(GROUP, 'user-2');
    expect(result).toHaveLength(1);
  });
});

describe('groupKeyService.deleteSenderKey', () => {
  it('deletes the sender key', async () => {
    repo.deleteSenderKey.mockResolvedValue(undefined);

    await groupKeyService.deleteSenderKey(GROUP, 'user-1');

    expect(repo.deleteSenderKey).toHaveBeenCalledWith(GROUP, 'user-1');
  });
});
