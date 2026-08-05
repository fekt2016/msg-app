import { StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../navigation/types';
import { WovenMark } from '../components/WovenMark';
import { Button } from '../components/Button';
import { colors, spacing } from '../theme/tokens';

type Props = NativeStackScreenProps<AuthStackParamList, 'Welcome'>;

export function WelcomeScreen({ navigation }: Props) {
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <View style={styles.container}>
        <View style={styles.brand}>
          <WovenMark />
          <Text style={styles.eyebrow}>E A Z C O M M U N I T Y</Text>
        </View>

        <View style={styles.hero}>
          <Text style={styles.headline}>Together,{'\n'}everywhere.</Text>
          <Text style={styles.subcopy}>
            Messages, communities, and marketplace — one trusted home for your people in Ghana and
            across Africa.
          </Text>
        </View>

        <View style={styles.actions}>
          <Button onPress={() => navigation.navigate('Register')}>Get started</Button>
          <Button variant="secondary" onPress={() => navigation.navigate('Login')}>
            Log in
          </Button>
        </View>

        <Text style={styles.footer}>End-to-end encrypted · Yours by design</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.baobab,
  },
  container: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.lg,
    justifyContent: 'space-between',
  },
  brand: {
    alignItems: 'center',
    gap: spacing.lg,
  },
  eyebrow: {
    color: colors.kenteGold,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 3,
  },
  hero: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  headline: {
    color: colors.savanna,
    fontSize: 46,
    lineHeight: 52,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subcopy: {
    color: colors.savannaMuted,
    fontSize: 17,
    lineHeight: 25,
    fontWeight: '400',
  },
  actions: {
    gap: spacing.sm,
  },
  footer: {
    color: colors.savannaMuted,
    fontSize: 12,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
});
