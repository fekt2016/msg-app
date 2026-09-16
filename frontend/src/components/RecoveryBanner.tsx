import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import type { AppStackParamList } from '../navigation/types';
import { colors, spacing, radius } from '../theme/tokens';

// Surfaces the recovery-backup nudge decided in AuthContext right where a user
// lands after signing in. Two flavours:
//  - 'backup'  → new identity, no server backup: prompt to save a recovery
//                phrase so a future device change is survivable.
//  - 'restore' → new device that already has a backup: offer to bring history
//                back instead of silently starting over on a fresh key.
// Renders nothing when there is no nudge. Dismissible — the user can always
// reach both flows later from Profile → Security.
const COPY: Record<'backup' | 'restore', { title: string; body: string; cta: string }> = {
  backup: {
    title: 'Back up your messages',
    body: 'Set up a recovery phrase so you can restore your chats if you lose or change your device.',
    cta: 'Set up',
  },
  restore: {
    title: 'Restore your messages',
    body: 'This device has a fresh key. Enter your recovery phrase to decrypt your existing history.',
    cta: 'Restore',
  },
};

export function RecoveryBanner() {
  const { recoveryPrompt, dismissRecoveryPrompt } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();

  if (recoveryPrompt === 'none') return null;
  const copy = COPY[recoveryPrompt];
  const target = recoveryPrompt === 'backup' ? 'RecoveryKeySetup' : 'RestoreRecovery';

  return (
    <View style={styles.banner} accessibilityRole="alert">
      <View style={styles.textCol}>
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.body}>{copy.body}</Text>
      </View>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.cta}
          onPress={() => navigation.navigate(target)}
          style={styles.ctaButton}
        >
          <Text style={styles.ctaText}>{copy.cta}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          onPress={dismissRecoveryPrompt}
          style={styles.dismissButton}
        >
          <Text style={styles.dismissText}>Not now</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.inputSurface,
    borderWidth: 1,
    borderColor: colors.kenteGold,
    gap: spacing.sm,
  },
  textCol: {
    gap: spacing.xs,
  },
  title: {
    color: colors.kenteGoldSoft,
    fontSize: 15,
    fontWeight: '700',
  },
  body: {
    color: colors.savannaMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  ctaButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.kenteGold,
  },
  ctaText: {
    color: colors.baobabDeep,
    fontSize: 14,
    fontWeight: '700',
  },
  dismissButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  dismissText: {
    color: colors.savannaMuted,
    fontSize: 14,
  },
});
