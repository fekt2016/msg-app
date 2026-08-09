import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MainTabs } from './MainTabs';
import { ChatScreen } from '../screens/ChatScreen';
import { CommunityDetailScreen } from '../screens/CommunityDetailScreen';
import { CreateCommunityScreen } from '../screens/CreateCommunityScreen';
import { GroupChatScreen } from '../screens/GroupChatScreen';
import { CreateGroupScreen } from '../screens/CreateGroupScreen';
import { RecoveryKeySetupScreen } from '../screens/RecoveryKeySetupScreen';
import { RestoreFromRecoveryScreen } from '../screens/RestoreFromRecoveryScreen';
import { ChannelsScreen } from '../screens/ChannelsScreen';
import { ChannelDetailScreen } from '../screens/ChannelDetailScreen';
import { CreateChannelScreen } from '../screens/CreateChannelScreen';
import { ChannelPostComposerScreen } from '../screens/ChannelPostComposerScreen';
import { JoinRequestScreen } from '../screens/JoinRequestScreen';
import { InvitesScreen } from '../screens/InvitesScreen';
import { InviteJoinScreen } from '../screens/InviteJoinScreen';
import { StoriesScreen } from '../screens/StoriesScreen';
import { StoryViewerScreen } from '../screens/StoryViewerScreen';
import { CreateStoryScreen } from '../screens/CreateStoryScreen';
import type { AppStackParamList } from './types';

const Stack = createNativeStackNavigator<AppStackParamList>();

export function AppNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#0F1B16' },
      }}
    >
      <Stack.Screen name="MainTabs" component={MainTabs} />
      <Stack.Screen name="Chat" component={ChatScreen} />
      <Stack.Screen name="CommunityDetail" component={CommunityDetailScreen} />
      <Stack.Screen name="CreateCommunity" component={CreateCommunityScreen} />
      <Stack.Screen name="GroupChat" component={GroupChatScreen} />
      <Stack.Screen name="CreateGroup" component={CreateGroupScreen} />
      <Stack.Screen name="RecoveryKeySetup" component={RecoveryKeySetupScreen} />
      <Stack.Screen name="RestoreRecovery" component={RestoreFromRecoveryScreen} />
      <Stack.Screen name="Channels" component={ChannelsScreen} />
      <Stack.Screen name="ChannelDetail" component={ChannelDetailScreen} />
      <Stack.Screen name="CreateChannel" component={CreateChannelScreen} />
      <Stack.Screen name="ChannelPostComposer" component={ChannelPostComposerScreen} />
      <Stack.Screen name="JoinRequests" component={JoinRequestScreen} />
      <Stack.Screen name="Invites" component={InvitesScreen} />
      <Stack.Screen name="InviteJoin" component={InviteJoinScreen} />
      <Stack.Screen name="Stories" component={StoriesScreen} />
      <Stack.Screen name="StoryViewer" component={StoryViewerScreen} />
      <Stack.Screen name="CreateStory" component={CreateStoryScreen} />
    </Stack.Navigator>
  );
}
