import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { isAxiosError } from 'axios';
import { useAuth } from '../auth/AuthContext';
import { isValidRecoveryPhrase, RecoveryPhraseError } from '../e2ee/recovery';
import { useRestoreRecovery } from '../hooks/useRecoveryBackup';
import type { AppStackParamList } from '../navigation/types';
import { colors, spacing, radius } from '../theme/tokens';

type Props = NativeStackScreenProps<AppStackParamList, 'RestoreRecovery'>;

export function RestoreFromRecoveryScreen({ navigation }: Props) {
  const { user } = useAuth();
  const restore = useRestoreRecovery();
  const [input, setInput] = useState('');

  const trimmed = input.trim();
  const looksValid = trimmed.length > 0 && isValidRecoveryPhrase(trimmed);
  const showChecksumHint = trimmed.split(/\s+/).length >= 24 && !looksValid;
  const done = restore.isSuccess;

  const errorText = restore.isError
    ? restore.error instanceof RecoveryPhraseError
      ? 'That recovery phrase does not match your backup. Check it and try again.'
      : isAxiosError(restore.error) && restore.error.response?.status === 404
        ? 'No backup was found for your account. Set one up on your other device first.'
        : 'Could not restore right now. Check your connection and try again.'
    : null;

  const handleRestore = () => {
    if (!user || !looksValid) return;
    restore.mutate({ userId: user.id, phrase: trimmed });
  };

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
        <Text style={styles.headerTitle}>Restore history</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>
          Enter the 24-word recovery phrase from your other device to restore your encrypted chat
          history on this one.
        </Text>

        {done ? (
          <Text style={styles.success}>
            Your identity was restored. Your chat history will decrypt on this device.
          </Text>
        ) : (
          <>
            <Text style={styles.sectionLabel}>Recovery phrase</Text>
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={(text) => {
                if (restore.isError) restore.reset();
                setInput(text);
              }}
              placeholder="word1 word2 word3 …"
              placeholderTextColor={colors.savannaMuted}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="24-word recovery phrase"
            />
            {showChecksumHint ? (
              <Text style={styles.hint}>
                This doesn&apos;t look like a valid phrase — check for typos or wrong words.
              </Text>
            ) : null}
          </>
        )}

        {errorText ? <Text style={styles.error}>{errorText}</Text> : null}

        {done ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Done"
            onPress={() => navigation.goBack()}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>Done</Text>
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Restore from recovery phrase"
            onPress={handleRestore}
            disabled={!looksValid || restore.isPending}
            style={[styles.primaryButton, (!looksValid || restore.isPending) && styles.disabled]}
          >
            <Text style={styles.primaryButtonText}>
              {restore.isPending ? 'Restoring…' : 'Restore'}
            </Text>
          </Pressable>
        )}
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
  content: { padding: spacing.lg, gap: spacing.md },
  intro: { color: colors.savannaMuted, fontSize: 14, lineHeight: 20 },
  sectionLabel: { color: colors.savannaMuted, fontSize: 13, fontWeight: '600' },
  input: {
    backgroundColor: colors.inputSurface,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.savanna,
    fontSize: 16,
    minHeight: 96,
    textAlignVertical: 'top',
  },
  hint: { color: colors.savannaMuted, fontSize: 13 },
  primaryButton: {
    backgroundColor: colors.kenteGold,
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  primaryButtonText: { color: colors.baobabDeep, fontWeight: '700', fontSize: 15 },
  disabled: { opacity: 0.5 },
  error: { color: colors.terracotta, fontSize: 14 },
  success: { color: colors.kenteGold, fontSize: 14, lineHeight: 20 },
});
