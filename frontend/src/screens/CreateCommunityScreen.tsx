import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCreateCommunity, useUpdateCommunity, useCommunity } from '../hooks/useCommunities';
import { apiErrorMessage } from '../api/client';
import { Button } from '../components/Button';
import { FormField } from '../components/FormField';
import type { CommunityVisibility } from '../api/communities';
import type { AppStackParamList } from '../navigation/types';
import { colors, radius, spacing } from '../theme/tokens';

type Props = NativeStackScreenProps<AppStackParamList, 'CreateCommunity'>;

export function CreateCommunityScreen({ route, navigation }: Props) {
  const editingIdentifier = route.params?.identifier ?? null;
  const { data: existing } = useCommunity(editingIdentifier ?? '', {
    enabled: editingIdentifier !== null,
  });

  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [visibility, setVisibility] = useState<CommunityVisibility>(
    existing?.visibility ?? 'PUBLIC',
  );
  const [error, setError] = useState<string | null>(null);

  const create = useCreateCommunity();
  const update = useUpdateCommunity(editingIdentifier ?? '');

  const isEditing = editingIdentifier !== null;
  const saving = create.isPending || update.isPending;

  useEffect(() => {
    if (!existing) return;
    setName(existing.name);
    setDescription(existing.description);
    setVisibility(existing.visibility);
  }, [existing?.id, existing?.name, existing?.description, existing?.visibility]);

  async function handleSubmit() {
    setError(null);
    const payload = {
      name: name.trim(),
      description: description.trim(),
      visibility,
    };
    try {
      const result = isEditing
        ? await update.mutateAsync(payload)
        : (await create.mutateAsync(payload)).community;
      navigation.replace('CommunityDetail', { identifier: result.slug });
    } catch (err) {
      setError(apiErrorMessage(err));
    }
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
        <Text style={styles.title}>{isEditing ? 'Edit community' : 'Create a community'}</Text>

        <FormField
          label="Name"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Accra Tech Meetup"
        />

        <View style={styles.field}>
          <Text style={styles.label}>Description</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="What is this community about?"
            placeholderTextColor={colors.savannaMuted}
            maxLength={500}
            multiline
            style={[styles.input, styles.multiline]}
            accessibilityLabel="Description"
          />
          <Text style={styles.counter}>{description.length}/500</Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Visibility</Text>
          <View style={styles.segmented}>
            {(['PUBLIC', 'PRIVATE'] as const).map((option) => (
              <Pressable
                key={option}
                accessibilityRole="button"
                accessibilityLabel={`${option} community`}
                onPress={() => setVisibility(option)}
                style={[styles.segment, visibility === option && styles.segmentActive]}
              >
                <Text
                  style={[styles.segmentText, visibility === option && styles.segmentTextActive]}
                >
                  {option === 'PUBLIC' ? 'Public' : 'Private'}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.hint}>
            Public communities are searchable and open to anyone. Private ones are invite-only.
          </Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button onPress={() => void handleSubmit()} loading={saving} disabled={!name.trim()}>
          {isEditing ? 'Save changes' : 'Create community'}
        </Button>
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
    gap: spacing.xs,
  },
  label: {
    color: colors.savanna,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing.sm,
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
  multiline: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  counter: {
    color: colors.savannaMuted,
    fontSize: 12,
    textAlign: 'right',
  },
  segmented: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  segment: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  segmentActive: {
    borderColor: colors.kenteGold,
    backgroundColor: colors.inputSurface,
  },
  segmentText: {
    color: colors.savannaMuted,
    fontSize: 15,
    fontWeight: '600',
  },
  segmentTextActive: {
    color: colors.kenteGold,
  },
  hint: {
    color: colors.savannaMuted,
    fontSize: 13,
  },
  error: {
    color: colors.terracotta,
    fontSize: 14,
  },
});
