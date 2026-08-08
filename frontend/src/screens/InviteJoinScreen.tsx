import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { usePreviewInvite, useJoinViaInvite } from '../hooks/useChannels';
import { apiErrorMessage } from '../api/client';
import { Button } from '../components/Button';
import { parseInviteToken } from '../utils/inviteLink';
import type { AppStackParamList } from '../navigation/types';
import { colors, radius, spacing } from '../theme/tokens';

type Props = NativeStackScreenProps<AppStackParamList, 'InviteJoin'>;

export function InviteJoinScreen({ route, navigation }: Props) {
  const initialToken = parseInviteToken(route.params?.token ?? '');
  const [token, setToken] = useState(initialToken);
  const [submittedToken, setSubmittedToken] = useState(initialToken);
  const join = useJoinViaInvite(submittedToken);

  const {
    data: preview,
    isLoading,
    isError,
    error,
    refetch,
  } = usePreviewInvite(submittedToken, {
    enabled: submittedToken.length > 0,
  });

  const canPreview = submittedToken.length > 0;

  function handleSubmit() {
    setSubmittedToken(parseInviteToken(token));
  }

  async function handleJoin() {
    if (!submittedToken) return;
    const result = await join.mutateAsync();
    navigation.replace('ChannelDetail', { identifier: result.channel.slug });
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Text style={styles.backArrow}>‹</Text>
        </Pressable>

        <Text style={styles.eyebrow}>E A Z C O M M U N I T Y</Text>
        <Text style={styles.title}>Join with invite</Text>

        <View style={styles.field}>
          <Text style={styles.label}>Invite link</Text>
          <TextInput
            value={token}
            onChangeText={setToken}
            onSubmitEditing={handleSubmit}
            placeholder="Paste the invite link…"
            placeholderTextColor={colors.savannaMuted}
            style={styles.input}
            accessibilityLabel="Invite link"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Button onPress={handleSubmit} disabled={!token.trim()} variant="secondary">
            Preview invite
          </Button>
        </View>

        {canPreview ? (
          <View style={styles.previewBox}>
            {isLoading ? (
              <ActivityIndicator color={colors.kenteGold} />
            ) : isError || !preview ? (
              <View style={styles.stateBox}>
                <Text style={styles.error}>{apiErrorMessage(error)}</Text>
                <Pressable accessibilityRole="button" onPress={() => void refetch()}>
                  <Text style={styles.retryText}>Try again</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <Text style={styles.previewName}>{preview.channelName}</Text>
                <Text style={styles.previewMeta}>
                  Grants you {preview.role.toLowerCase()} access · expires{' '}
                  {new Date(preview.expiresAt).toLocaleDateString()}
                </Text>
                <Button
                  onPress={() => void handleJoin()}
                  loading={join.isPending}
                  disabled={join.isPending}
                >
                  Join channel
                </Button>
                {join.error ? (
                  <Text style={styles.error}>{apiErrorMessage(join.error)}</Text>
                ) : null}
              </>
            )}
          </View>
        ) : (
          <Text style={styles.hint}>
            Paste an invite link to preview and join a private channel.
          </Text>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.baobab,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
    paddingRight: spacing.xs,
  },
  backArrow: {
    color: colors.kenteGold,
    fontSize: 30,
    lineHeight: 32,
    fontWeight: '700',
  },
  eyebrow: {
    color: colors.kenteGold,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 3,
  },
  title: {
    color: colors.savanna,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '800',
  },
  field: {
    gap: spacing.sm,
  },
  label: {
    color: colors.savanna,
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    backgroundColor: colors.inputSurface,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    color: colors.savanna,
    fontSize: 16,
  },
  hint: {
    color: colors.savannaMuted,
    fontSize: 14,
  },
  previewBox: {
    gap: spacing.sm,
    backgroundColor: colors.inputSurface,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  previewName: {
    color: colors.savanna,
    fontSize: 20,
    fontWeight: '800',
  },
  previewMeta: {
    color: colors.savannaMuted,
    fontSize: 13,
  },
  stateBox: {
    gap: spacing.sm,
  },
  retryText: {
    color: colors.kenteGold,
    fontSize: 15,
    fontWeight: '600',
  },
  error: {
    color: colors.terracotta,
    fontSize: 14,
  },
});
