import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { AuthNavigator } from './AuthNavigator';
import { AppNavigator } from './AppNavigator';
import type { RootStackParamList } from './types';
import { colors } from '../theme/tokens';

const RootStack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.kenteGold} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {isAuthenticated ? (
          <RootStack.Screen name="App" component={AppNavigator} />
        ) : (
          <RootStack.Screen name="Auth" component={AuthNavigator} />
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.baobab,
  },
});
