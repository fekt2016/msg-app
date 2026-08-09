import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { useCreateStory } from '../hooks/useStories';
import { apiErrorMessage } from '../api/client';
import type { PickedMedia } from '../api/stories';
import { Button } from '../components/Button';
import type { AppStackParamList } from '../navigation/types';
import { colors, radius, spacing } from '../theme/tokens';

type Props = NativeStackScreenProps<AppStackParamList, 'CreateStory'>;

export function CreateStoryScreen({ navigation }: Props) {
  const createStory = useCreateStory();
  const [caption, setCaption] = useState('');
  const [media, setMedia] = useState<PickedMedia | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  async function handlePickMedia() {
    setError(null);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsEditing: true,
      quality: 0.8,
    });
    if (result.canceled || result.assets.length === 0) return;
    const asset = result.assets[0];
    const isVideo = asset.type === 'video';
    setMedia({
      uri: asset.uri,
      name: asset.fileName ?? (isVideo ? 'story.mp4' : 'story.jpg'),
      type: asset.mimeType ?? (isVideo ? 'video/mp4' : 'image/jpeg'),
    });
  }

  async function handlePublish() {
    if (!media) {
      setError('Pick a photo or video first.');
      return;
    }
    setError(null);
    setPublishing(true);
    try {
      await createStory.mutateAsync({ media, caption: caption.trim() || undefined });
      navigation.goBack();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setPublishing(false);
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
        <Text style={styles.title}>Share a story</Text>
        <Text style={styles.subtitle}>A photo or video that disappears in 24 hours.</Text>

        {media ? (
          <View style={styles.mediaWrap}>
            <Image source={{ uri: media.uri }} style={styles.preview} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Remove selected media"
              onPress={() => setMedia(null)}
              style={styles.removeButton}
            >
              <Text style={styles.removeText}>×</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Pick a photo or video"
            onPress={() => void handlePickMedia()}
            style={styles.pickButton}
          >
            <Text style={styles.pickButtonText}>+ Pick a photo or video</Text>
          </Pressable>
        )}

        <TextInput
          value={caption}
          onChangeText={setCaption}
          placeholder="Add a caption (optional)"
          placeholderTextColor={colors.savannaMuted}
          maxLength={500}
          multiline
          style={[styles.input, styles.multiline]}
          accessibilityLabel="Story caption"
        />
        <Text style={styles.counter}>{caption.length}/500</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button onPress={() => void handlePublish()} loading={publishing}>
          Publish story
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
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.savannaMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  mediaWrap: {
    position: 'relative',
  },
  preview: {
    width: '100%',
    height: 240,
    borderRadius: radius.md,
  },
  removeButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: colors.baobabDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: {
    color: colors.kenteGold,
    fontSize: 18,
    lineHeight: 20,
    fontWeight: '700',
  },
  pickButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.kenteGold,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  pickButtonText: {
    color: colors.kenteGold,
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
  multiline: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  counter: {
    color: colors.savannaMuted,
    fontSize: 12,
    textAlign: 'right',
  },
  error: {
    color: colors.terracotta,
    fontSize: 14,
  },
});
