import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from './types';

// Container-level ref so imperative navigation (e.g. from a tapped push
// notification, which happens outside any screen) can drive the navigator.
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

interface PushRouteData {
  type?: string;
  senderId?: string;
  senderName?: string;
  groupId?: string;
  groupName?: string;
  identifier?: string;
  storyId?: string;
  authorId?: string;
  authorDisplayName?: string;
}

/**
 * Routes a tapped notification to the screen it refers to, using the `data`
 * payload the backend attached (ids + names — never message content, which is
 * E2EE). No-op when the container isn't mounted yet or the payload is
 * unrecognised, so a stray/legacy notification can never crash navigation.
 */
export function navigateFromPushData(data: unknown): void {
  if (!navigationRef.isReady() || !data || typeof data !== 'object') {
    return;
  }
  const d = data as PushRouteData;

  if (d.type === 'chat:message' && d.senderId) {
    navigationRef.navigate('App', {
      screen: 'Chat',
      params: { userId: String(d.senderId), displayName: d.senderName ? String(d.senderName) : '' },
    });
    return;
  }

  if (d.type === 'chat:group:message' && d.groupId) {
    navigationRef.navigate('App', {
      screen: 'GroupChat',
      params: { groupId: String(d.groupId), name: d.groupName ? String(d.groupName) : '' },
    });
    return;
  }

  if (d.type === 'group:member:joined' && d.groupId) {
    navigationRef.navigate('App', {
      screen: 'GroupChat',
      params: { groupId: String(d.groupId), name: d.groupName ? String(d.groupName) : '' },
    });
    return;
  }

  if (d.type === 'community:role' && d.identifier) {
    navigationRef.navigate('App', {
      screen: 'CommunityDetail',
      params: { identifier: String(d.identifier) },
    });
    return;
  }

  if ((d.type === 'channel:post:new' || d.type === 'channel:request:approved') && d.identifier) {
    navigationRef.navigate('App', {
      screen: 'ChannelDetail',
      params: { identifier: String(d.identifier) },
    });
    return;
  }

  if (d.type === 'story:liked' && d.authorId) {
    navigationRef.navigate('App', {
      screen: 'StoryViewer',
      params: {
        authorId: String(d.authorId),
        displayName: d.authorDisplayName ? String(d.authorDisplayName) : '',
      },
    });
  }
}
