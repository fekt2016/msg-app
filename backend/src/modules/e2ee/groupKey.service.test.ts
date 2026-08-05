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
    deleteEnvelopesForRecipient: vi.fn(),
  },
}));

vi.mock('../groups/group.repository.js', () => ({
  groupRepository: {
    listMemberIds: vi.fn(),
    isMember: vi.fn(),
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
    groups.isMember.mockResolvedValue(true);
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
    groups.isMember.mockResolvedValue(true);
    repo.findEnvelopeForRecipient.mockResolvedValue(null);

    await expect(groupKeyService.getSenderKey(GROUP, 'user-1', 'user-2')).rejects.toMatchObject({
      statusCode: 404,
      code: 'SENDER_KEY_NOT_FOUND',
    });
  });

  it('rejects a non-member (removed member) before reading any key material', async () => {
    groups.isMember.mockResolvedValue(false);

    await expect(groupKeyService.getSenderKey(GROUP, 'user-1', 'removed')).rejects.toMatchObject({
      statusCode: 403,
      code: 'NOT_GROUP_MEMBER',
    });
    expect(repo.findEnvelopeForRecipient).not.toHaveBeenCalled();
  });
});

describe('groupKeyService.listSenderKeys', () => {
  it('lists senders that distributed a key to the recipient', async () => {
    groups.isMember.mockResolvedValue(true);
    repo.listSendersForRecipient.mockResolvedValue([
      { senderId: 'user-1', keyId: 3, updatedAt: new Date() },
    ]);

    const result = await groupKeyService.listSenderKeys(GROUP, 'user-2');

    expect(repo.listSendersForRecipient).toHaveBeenCalledWith(GROUP, 'user-2');
    expect(result).toHaveLength(1);
  });

  it('rejects a non-member', async () => {
    groups.isMember.mockResolvedValue(false);

    await expect(groupKeyService.listSenderKeys(GROUP, 'removed')).rejects.toMatchObject({
      statusCode: 403,
      code: 'NOT_GROUP_MEMBER',
    });
    expect(repo.listSendersForRecipient).not.toHaveBeenCalled();
  });
});

describe('groupKeyService.deleteSenderKey', () => {
  it('deletes the caller’s own sender key', async () => {
    repo.deleteSenderKey.mockResolvedValue(undefined);

    await groupKeyService.deleteSenderKey(GROUP, 'user-1', 'user-1');

    expect(repo.deleteSenderKey).toHaveBeenCalledWith(GROUP, 'user-1');
  });

  it('forbids deleting another member’s sender key', async () => {
    await expect(
      groupKeyService.deleteSenderKey(GROUP, 'victim', 'attacker'),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    expect(repo.deleteSenderKey).not.toHaveBeenCalled();
  });
});

describe('groupKeyService.purgeMember', () => {
  it('drops the member’s own key and every envelope addressed to them', async () => {
    repo.deleteSenderKey.mockResolvedValue(undefined);
    repo.deleteEnvelopesForRecipient.mockResolvedValue(undefined);

    await groupKeyService.purgeMember(GROUP, 'gone');

    expect(repo.deleteSenderKey).toHaveBeenCalledWith(GROUP, 'gone');
    expect(repo.deleteEnvelopesForRecipient).toHaveBeenCalledWith(GROUP, 'gone');
  });
});

describe('groupKeyService.purgeGroup', () => {
  it('drops all sender-key material for the group', async () => {
    repo.deleteByGroup.mockResolvedValue(undefined);

    await groupKeyService.purgeGroup(GROUP);

    expect(repo.deleteByGroup).toHaveBeenCalledWith(GROUP);
  });
});
