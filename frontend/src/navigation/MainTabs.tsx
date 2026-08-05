import { StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { HomeScreen } from '../screens/HomeScreen';
import { CommunitiesScreen } from '../screens/CommunitiesScreen';
import { ChatsScreen } from '../screens/ChatsScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import type { MainTabsParamList } from './types';
import { colors } from '../theme/tokens';

const Tab = createBottomTabNavigator<MainTabsParamList>();

type IconName = keyof typeof Ionicons.glyphMap;

const TAB_ICONS: Record<keyof MainTabsParamList, { active: IconName; inactive: IconName }> = {
  Home: { active: 'home', inactive: 'home-outline' },
  Communities: { active: 'planet', inactive: 'planet-outline' },
  Chats: { active: 'chatbubbles', inactive: 'chatbubbles-outline' },
  Profile: { active: 'person', inactive: 'person-outline' },
};

export function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        sceneStyle: { backgroundColor: colors.baobab },
        tabBarActiveTintColor: colors.kenteGold,
        tabBarInactiveTintColor: colors.savannaMuted,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.label,
        tabBarIcon: ({ color, focused }) => (
          <Ionicons
            name={focused ? TAB_ICONS[route.name].active : TAB_ICONS[route.name].inactive}
            color={color}
            size={22}
          />
        ),
      })}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ tabBarAccessibilityLabel: 'Home tab' }}
      />
      <Tab.Screen
        name="Communities"
        component={CommunitiesScreen}
        options={{ tabBarAccessibilityLabel: 'Communities tab' }}
      />
      <Tab.Screen
        name="Chats"
        component={ChatsScreen}
        options={{ tabBarAccessibilityLabel: 'Chats tab' }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ tabBarAccessibilityLabel: 'Profile tab' }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.baobabDeep,
    borderTopColor: colors.inputBorder,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
  },
});
