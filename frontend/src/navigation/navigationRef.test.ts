import { navigateFromPushData, navigationRef } from './navigationRef';

describe('navigateFromPushData', () => {
  const navigate = jest.spyOn(navigationRef, 'navigate').mockImplementation(() => undefined);
  const isReady = jest.spyOn(navigationRef, 'isReady');

  beforeEach(() => {
    navigate.mockClear();
    isReady.mockReturnValue(true);
  });

  it('routes a 1:1 message tap to the Chat screen with sender id + name', () => {
    navigateFromPushData({ type: 'chat:message', senderId: 'u1', senderName: 'Ama' });
    expect(navigate).toHaveBeenCalledWith('App', {
      screen: 'Chat',
      params: { userId: 'u1', displayName: 'Ama' },
    });
  });

  it('routes a group message tap to the GroupChat screen with group id + name', () => {
    navigateFromPushData({ type: 'chat:group:message', groupId: 'g1', groupName: 'Team' });
    expect(navigate).toHaveBeenCalledWith('App', {
      screen: 'GroupChat',
      params: { groupId: 'g1', name: 'Team' },
    });
  });

  it('falls back to an empty name when the payload omits it', () => {
    navigateFromPushData({ type: 'chat:message', senderId: 'u1' });
    expect(navigate).toHaveBeenCalledWith('App', {
      screen: 'Chat',
      params: { userId: 'u1', displayName: '' },
    });
  });

  it('routes a group-member-joined notification to the GroupChat screen', () => {
    navigateFromPushData({ type: 'group:member:joined', groupId: 'g1', groupName: 'Team' });
    expect(navigate).toHaveBeenCalledWith('App', {
      screen: 'GroupChat',
      params: { groupId: 'g1', name: 'Team' },
    });
  });

  it('routes a community role notification to the CommunityDetail screen', () => {
    navigateFromPushData({ type: 'community:role', identifier: 'accra-tech' });
    expect(navigate).toHaveBeenCalledWith('App', {
      screen: 'CommunityDetail',
      params: { identifier: 'accra-tech' },
    });
  });

  it('routes channel post and join-approval notifications to the ChannelDetail screen', () => {
    navigateFromPushData({ type: 'channel:post:new', identifier: 'accra-news' });
    navigateFromPushData({ type: 'channel:request:approved', identifier: 'accra-news' });
    expect(navigate).toHaveBeenCalledWith('App', {
      screen: 'ChannelDetail',
      params: { identifier: 'accra-news' },
    });
    expect(navigate).toHaveBeenCalledTimes(2);
  });

  it('routes a story-like notification to the author’s StoryViewer', () => {
    navigateFromPushData({ type: 'story:liked', authorId: 'u1', authorDisplayName: 'Ama' });
    expect(navigate).toHaveBeenCalledWith('App', {
      screen: 'StoryViewer',
      params: { authorId: 'u1', displayName: 'Ama' },
    });
  });

  it('ignores a group-member-left notification (no surface to open)', () => {
    navigateFromPushData({ type: 'group:member:left', groupId: 'g1', groupName: 'Team' });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('is a no-op when the container is not ready', () => {
    isReady.mockReturnValue(false);
    navigateFromPushData({ type: 'chat:message', senderId: 'u1' });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('ignores unrecognised or empty payloads', () => {
    navigateFromPushData({ type: 'chat:message' }); // missing senderId
    navigateFromPushData({ type: 'something:else', senderId: 'u1' });
    navigateFromPushData(null);
    navigateFromPushData('nope');
    expect(navigate).not.toHaveBeenCalled();
  });
});
