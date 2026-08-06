import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MainTabs } from './MainTabs';
import { ChatScreen } from '../screens/ChatScreen';
import { CommunityDetailScreen } from '../screens/CommunityDetailScreen';
import { CreateCommunityScreen } from '../screens/CreateCommunityScreen';
import { GroupChatScreen } from '../screens/GroupChatScreen';
import { CreateGroupScreen } from '../screens/CreateGroupScreen';
import { RecoveryKeySetupScreen } from '../screens/RecoveryKeySetupScreen';
import { RestoreFromRecoveryScreen } from '../screens/RestoreFromRecoveryScreen';
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
    </Stack.Navigator>
  );
}
