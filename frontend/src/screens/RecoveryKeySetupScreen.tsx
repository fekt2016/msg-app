import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { newRecoveryPhrase, NoLocalIdentityError } from '../e2ee/recoverySession';
import {
  useRecoveryBackupStatus,
  useEnableRecoveryBackup,
  useDisableRecoveryBackup,
} from '../hooks/useRecoveryBackup';
import type { AppStackParamList } from '../navigation/types';
import { colors, spacing, radius } from '../theme/tokens';

type Props = NativeStackScreenProps<AppStackParamList, 'RecoveryKeySetup'>;

export function RecoveryKeySetupScreen({ navigation }: Props) {
  const status = useRecoveryBackupStatus();
  const enableBackup = useEnableRecoveryBackup();
  const disableBackup = useDisableRecoveryBackup();

  const [phrase, setPhrase] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const done = enableBackup.isSuccess;
  const words = phrase ? phrase.split(' ') : [];

  // Drop the phrase from screen state once the backup is stored — it should live
  // only in the user's own record, never linger in memory/UI.
  useEffect(() => {
    if (enableBackup.isSuccess) {
      setPhrase(null);
      setConfirmed(false);
    }
  }, [enableBackup.isSuccess]);

  const errorText = enableBackup.isError
    ? enableBackup.error instanceof NoLocalIdentityError
      ? 'This device has no encryption identity yet. Open a chat first, then try again.'
      : 'Could not save your backup. Check your connection and try again.'
    : disableBackup.isError
      ? 'Could not disable the backup. Try again.'
      : null;

  const handleGenerate = () => {
    enableBackup.reset();
    setConfirmed(false);
    setPhrase(newRecoveryPhrase());
  };

  const handleCreate = () => {
    if (!phrase) return;
    enableBackup.mutate(phrase);
  };

  const handleDisable = () => {
    disableBackup.mutate();
  };

  const backupExists = status.data?.exists ?? false;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Text style={styles.backArrow}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Recovery key</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>
          A recovery phrase lets you restore your chat history on a new phone. Only you hold it —
          write it down and keep it somewhere safe. If you lose it, your history cannot be
          recovered.
        </Text>

        {status.isLoading ? (
          <Text style={styles.muted}>Checking backup status…</Text>
        ) : backupExists && !phrase ? (
          <View style={styles.statusCard}>
            <Text style={styles.statusActive}>✓ Backup active</Text>
            <Text style={styles.muted}>
              You can generate a new phrase to replace it, or disable the backup.
            </Text>
          </View>
        ) : null}

        {done ? (
          <Text style={styles.success}>Backup saved. Keep your recovery phrase safe.</Text>
        ) : null}

        {phrase ? (
          <View>
            <Text style={styles.sectionLabel}>Your 24-word recovery phrase</Text>
            <View
              style={styles.phraseBox}
              accessibilityLabel={`Recovery phrase: ${phrase}`}
              accessible
            >
              {words.map((word, i) => (
                <View key={`${i}-${word}`} style={styles.wordChip}>
                  <Text style={styles.wordIndex}>{i + 1}</Text>
                  <Text style={styles.wordText}>{word}</Text>
                </View>
              ))}
            </View>

            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: confirmed }}
              accessibilityLabel="I have written down my recovery phrase"
              onPress={() => setConfirmed((v) => !v)}
              style={styles.confirmRow}
            >
              <View style={[styles.checkbox, confirmed && styles.checkboxOn]}>
                {confirmed && <Text style={styles.checkboxMark}>✓</Text>}
              </View>
              <Text style={styles.confirmText}>
                I&apos;ve written down my phrase and stored it safely
              </Text>
            </Pressable>
          </View>
        ) : null}

        {errorText ? <Text style={styles.error}>{errorText}</Text> : null}

        {phrase ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Create backup"
            onPress={handleCreate}
            disabled={!confirmed || enableBackup.isPending}
            style={[
              styles.primaryButton,
              (!confirmed || enableBackup.isPending) && styles.disabled,
            ]}
          >
            <Text style={styles.primaryButtonText}>
              {enableBackup.isPending ? 'Saving…' : 'Create backup'}
            </Text>
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Generate recovery phrase"
            onPress={handleGenerate}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>
              {backupExists ? 'Generate a new phrase' : 'Generate recovery phrase'}
            </Text>
          </Pressable>
        )}

        {backupExists && !phrase ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Disable backup"
            onPress={handleDisable}
            disabled={disableBackup.isPending}
            style={styles.dangerButton}
          >
            <Text style={styles.dangerText}>
              {disableBackup.isPending ? 'Disabling…' : 'Disable backup'}
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.baobab },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.inputBorder,
  },
  backButton: { paddingVertical: spacing.xs, paddingRight: spacing.xs },
  backArrow: { color: colors.kenteGold, fontSize: 30, lineHeight: 32, fontWeight: '700' },
  headerTitle: { color: colors.savanna, fontSize: 18, fontWeight: '700' },
  content: { padding: spacing.lg, gap: spacing.lg },
  intro: { color: colors.savannaMuted, fontSize: 14, lineHeight: 20 },
  muted: { color: colors.savannaMuted, fontSize: 14 },
  statusCard: {
    backgroundColor: colors.inputSurface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  statusActive: { color: colors.kenteGold, fontSize: 15, fontWeight: '700' },
  sectionLabel: {
    color: colors.savannaMuted,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  phraseBox: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    backgroundColor: colors.inputSurface,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  wordChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.baobabDeep,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  wordIndex: { color: colors.savannaMuted, fontSize: 11, fontWeight: '700' },
  wordText: { color: colors.savanna, fontSize: 15, fontWeight: '600' },
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.inputBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.kenteGold, borderColor: colors.kenteGold },
  checkboxMark: { color: colors.baobabDeep, fontWeight: '700', fontSize: 14 },
  confirmText: { color: colors.savanna, fontSize: 14, flex: 1 },
  primaryButton: {
    backgroundColor: colors.kenteGold,
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  primaryButtonText: { color: colors.baobabDeep, fontWeight: '700', fontSize: 15 },
  disabled: { opacity: 0.5 },
  dangerButton: { alignItems: 'center', paddingVertical: spacing.sm },
  dangerText: { color: colors.terracotta, fontSize: 15, fontWeight: '600' },
  error: { color: colors.terracotta, fontSize: 14 },
  success: { color: colors.kenteGold, fontSize: 14 },
});
