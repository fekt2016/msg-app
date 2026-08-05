import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useChatUsers } from '../hooks/useChatUsers';
import { useCreateGroup } from '../hooks/useGroups';
import type { AppStackParamList } from '../navigation/types';
import { colors, spacing, radius } from '../theme/tokens';

type Props = NativeStackScreenProps<AppStackParamList, 'CreateGroup'>;

export function CreateGroupScreen({ navigation }: Props) {
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const { data: users, isLoading } = useChatUsers();
  const createGroup = useCreateGroup();

  const toggle = (userId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Give your group a name.');
      return;
    }
    setError(null);
    try {
      const group = await createGroup.mutateAsync({ name: trimmed, memberIds: [...selected] });
      navigation.replace('GroupChat', { groupId: group.id, name: group.name });
    } catch {
      setError('Could not create the group. Try again.');
    }
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
        <Text style={styles.headerTitle}>New group</Text>
      </View>

      <TextInput
        style={styles.input}
        value={name}
        onChangeText={(text) => {
          if (error) setError(null);
          setName(text);
        }}
        placeholder="Group name"
        placeholderTextColor={colors.savannaMuted}
        maxLength={100}
        accessibilityLabel="Group name"
      />

      <Text style={styles.sectionLabel}>Add members</Text>

      {isLoading ? (
        <Text style={styles.muted}>Loading people…</Text>
      ) : (
        <FlatList
          data={users ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const isSelected = selected.has(item.id);
            return (
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isSelected }}
                accessibilityLabel={item.displayName}
                onPress={() => toggle(item.id)}
                style={styles.row}
              >
                <View style={[styles.checkbox, isSelected && styles.checkboxOn]}>
                  {isSelected && <Text style={styles.checkboxMark}>✓</Text>}
                </View>
                <Text style={styles.rowName}>{item.displayName}</Text>
              </Pressable>
            );
          }}
          ListEmptyComponent={<Text style={styles.muted}>No one to add yet.</Text>}
        />
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Create group"
        onPress={() => void handleCreate()}
        disabled={createGroup.isPending}
        style={[styles.createButton, createGroup.isPending && styles.disabled]}
      >
        <Text style={styles.createButtonText}>
          {createGroup.isPending ? 'Creating…' : 'Create group'}
        </Text>
      </Pressable>
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
  input: {
    margin: spacing.lg,
    marginBottom: spacing.sm,
    backgroundColor: colors.inputSurface,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.savanna,
    fontSize: 15,
  },
  sectionLabel: {
    color: colors.savannaMuted,
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  list: { paddingHorizontal: spacing.lg, gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
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
  rowName: { color: colors.savanna, fontSize: 16 },
  muted: { color: colors.savannaMuted, fontSize: 14, paddingHorizontal: spacing.lg },
  error: { color: colors.terracotta, fontSize: 13, paddingHorizontal: spacing.lg },
  createButton: {
    margin: spacing.lg,
    backgroundColor: colors.kenteGold,
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  disabled: { opacity: 0.5 },
  createButtonText: { color: colors.baobabDeep, fontWeight: '700', fontSize: 15 },
});
