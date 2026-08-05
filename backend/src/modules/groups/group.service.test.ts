import { beforeEach, describe, expect, it, vi } from 'vitest';
import { groupService } from './group.service.js';
import * as groupRepositoryModule from './group.repository.js';
import * as userRepositoryModule from '../auth/user.repository.js';
import * as groupKeyServiceModule from '../e2ee/groupKey.service.js';
import * as groupEventsModule from '../../realtime/groupEvents.js';

vi.mock('./group.repository.js', () => ({
  groupRepository: {
    create: vi.fn(),
    findById: vi.fn(),
    softDelete: vi.fn(),
    incrementMemberCount: vi.fn(),
    addMember: vi.fn(),
    removeMember: vi.fn(),
    findMember: vi.fn(),
    isMember: vi.fn(),
    listMemberIds: vi.fn(),
    listGroupsForUser: vi.fn(),
    listMembers: vi.fn(),
  },
}));

vi.mock('../auth/user.repository.js', () => ({
  userRepository: {
    findByIds: vi.fn(),
  },
}));

vi.mock('../e2ee/groupKey.service.js', () => ({
  groupKeyService: {
    purgeMember: vi.fn(),
    purgeGroup: vi.fn(),
  },
}));

vi.mock('../../realtime/groupEvents.js', () => ({
  groupEventBus: {
    emitMemberJoined: vi.fn(),
    emitMemberLeft: vi.fn(),
    emitDeleted: vi.fn(),
  },
}));

const repo = vi.mocked(groupRepositoryModule.groupRepository);
const users = vi.mocked(userRepositoryModule.userRepository);
const groupKeys = vi.mocked(groupKeyServiceModule.groupKeyService);
const bus = vi.mocked(groupEventsModule.groupEventBus);

const OWNER = 'owner-1';

function makeGroup(id: string, ownerId: string, extra: Record<string, unknown> = {}) {
  return {
    _id: { toString: () => id },
    name: 'Squad',
    avatar: undefined,
    ownerId: { toString: () => ownerId },
    memberCount: 1,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...extra,
  } as never;
}

function existingUsers(ids: string[]) {
  return ids.map((id) => ({ _id: { toString: () => id } })) as never;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('groupService.create', () => {
  it('creates a group with the owner and deduped invitees', async () => {
    repo.create.mockResolvedValue(makeGroup('g-1', OWNER));
    users.findByIds.mockResolvedValue(existingUsers(['u-2', 'u-3']));

    const result = await groupService.create(OWNER, {
      name: 'Squad',
      memberIds: ['u-2', 'u-3', 'u-2', OWNER],
    });

    expect(repo.addMember).toHaveBeenCalledWith('g-1', OWNER, 'OWNER');
    expect(repo.addMember).toHaveBeenCalledWith('g-1', 'u-2', 'MEMBER');
    expect(repo.addMember).toHaveBeenCalledWith('g-1', 'u-3', 'MEMBER');
    expect(repo.incrementMemberCount).toHaveBeenCalledWith('g-1', 3);
    expect(bus.emitMemberJoined).toHaveBeenCalledTimes(2);
    expect(result.role).toBe('OWNER');
    expect(result.memberCount).toBe(3);
  });

  it('rejects unknown invitees', async () => {
    users.findByIds.mockResolvedValue(existingUsers(['u-2']));
    await expect(
      groupService.create(OWNER, { name: 'Squad', memberIds: ['u-2', 'ghost'] }),
    ).rejects.toMatchObject({ statusCode: 422, code: 'UNKNOWN_MEMBER' });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('rejects a group that exceeds the member cap', async () => {
    const tooMany = Array.from({ length: 256 }, (_, i) => `u-${i}`);
    await expect(
      groupService.create(OWNER, { name: 'Squad', memberIds: tooMany }),
    ).rejects.toMatchObject({ statusCode: 422, code: 'GROUP_TOO_LARGE' });
  });
});

describe('groupService.getForMember', () => {
  it('returns the group with the viewer role for a member', async () => {
    repo.findById.mockResolvedValue(makeGroup('g-1', OWNER));
    repo.findMember.mockResolvedValue({ role: 'MEMBER' } as never);

    const result = await groupService.getForMember('u-2', 'g-1');
    expect(result.role).toBe('MEMBER');
  });

  it('404s when the group does not exist', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(groupService.getForMember('u-2', 'g-1')).rejects.toMatchObject({
      statusCode: 404,
      code: 'GROUP_NOT_FOUND',
    });
  });

  it('403s when the viewer is not a member', async () => {
    repo.findById.mockResolvedValue(makeGroup('g-1', OWNER));
    repo.findMember.mockResolvedValue(null);
    await expect(groupService.getForMember('stranger', 'g-1')).rejects.toMatchObject({
      statusCode: 403,
      code: 'NOT_GROUP_MEMBER',
    });
  });
});

describe('groupService.addMembers', () => {
  it('adds only new members and emits joined events', async () => {
    repo.findById.mockResolvedValue(makeGroup('g-1', OWNER, { memberCount: 2 }));
    users.findByIds.mockResolvedValue(existingUsers(['u-2', 'u-3']));
    repo.findMember
      .mockResolvedValueOnce({ role: 'MEMBER' } as never) // u-2 already a member
      .mockResolvedValueOnce(null); // u-3 is new

    const result = await groupService.addMembers(OWNER, 'g-1', ['u-2', 'u-3']);

    expect(result.added).toEqual(['u-3']);
    expect(repo.addMember).toHaveBeenCalledWith('g-1', 'u-3', 'MEMBER');
    expect(repo.incrementMemberCount).toHaveBeenCalledWith('g-1', 1);
    expect(bus.emitMemberJoined).toHaveBeenCalledWith('g-1', 'u-3');
  });

  it('forbids a non-owner from adding members', async () => {
    repo.findById.mockResolvedValue(makeGroup('g-1', OWNER));
    await expect(groupService.addMembers('u-2', 'g-1', ['u-3'])).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  });
});

describe('groupService.removeMember', () => {
  it('removes a member and emits left', async () => {
    repo.findById.mockResolvedValue(makeGroup('g-1', OWNER));
    repo.findMember.mockResolvedValue({ role: 'MEMBER' } as never);

    await groupService.removeMember(OWNER, 'g-1', 'u-2');
    expect(repo.removeMember).toHaveBeenCalledWith('g-1', 'u-2');
    expect(repo.incrementMemberCount).toHaveBeenCalledWith('g-1', -1);
    expect(groupKeys.purgeMember).toHaveBeenCalledWith('g-1', 'u-2');
    expect(bus.emitMemberLeft).toHaveBeenCalledWith('g-1', 'u-2');
  });

  it('refuses to remove the owner', async () => {
    repo.findById.mockResolvedValue(makeGroup('g-1', OWNER));
    await expect(groupService.removeMember(OWNER, 'g-1', OWNER)).rejects.toMatchObject({
      statusCode: 400,
      code: 'CANNOT_REMOVE_OWNER',
    });
  });
});

describe('groupService.leave', () => {
  it('lets a member leave', async () => {
    repo.findById.mockResolvedValue(makeGroup('g-1', OWNER));
    repo.findMember.mockResolvedValue({ role: 'MEMBER' } as never);

    await groupService.leave('u-2', 'g-1');
    expect(repo.removeMember).toHaveBeenCalledWith('g-1', 'u-2');
    expect(groupKeys.purgeMember).toHaveBeenCalledWith('g-1', 'u-2');
    expect(bus.emitMemberLeft).toHaveBeenCalledWith('g-1', 'u-2');
  });

  it('prevents the owner from leaving', async () => {
    repo.findById.mockResolvedValue(makeGroup('g-1', OWNER));
    repo.findMember.mockResolvedValue({ role: 'OWNER' } as never);

    await expect(groupService.leave(OWNER, 'g-1')).rejects.toMatchObject({
      statusCode: 400,
      code: 'OWNER_CANNOT_LEAVE',
    });
  });
});

describe('groupService.softDelete', () => {
  it('soft-deletes the group and clears memberships (owner only)', async () => {
    repo.findById.mockResolvedValue(makeGroup('g-1', OWNER));
    repo.listMemberIds.mockResolvedValue([OWNER, 'u-2']);

    await groupService.softDelete(OWNER, 'g-1');

    expect(repo.softDelete).toHaveBeenCalledWith('g-1');
    expect(repo.removeMember).toHaveBeenCalledWith('g-1', OWNER);
    expect(repo.removeMember).toHaveBeenCalledWith('g-1', 'u-2');
    expect(groupKeys.purgeGroup).toHaveBeenCalledWith('g-1');
    expect(bus.emitDeleted).toHaveBeenCalledWith('g-1', [OWNER, 'u-2']);
  });

  it('forbids a non-owner from deleting', async () => {
    repo.findById.mockResolvedValue(makeGroup('g-1', OWNER));
    await expect(groupService.softDelete('u-2', 'g-1')).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  });
});
