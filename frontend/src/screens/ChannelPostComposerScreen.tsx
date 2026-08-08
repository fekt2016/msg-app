import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { useCreatePost, useChannel } from '../hooks/useChannels';
import { apiErrorMessage } from '../api/client';
import { addPostImage, type PickedImage } from '../api/channels';
import { Button } from '../components/Button';
import type { AppStackParamList } from '../navigation/types';
import { colors, radius, spacing } from '../theme/tokens';

type Props = NativeStackScreenProps<AppStackParamList, 'ChannelPostComposer'>;

export function ChannelPostComposerScreen({ route, navigation }: Props) {
  const { identifier } = route.params;
  const { data: channel } = useChannel(identifier);
  const createPost = useCreatePost(identifier);

  const [body, setBody] = useState('');
  const [image, setImage] = useState<PickedImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  async function handlePickImage() {
    setError(null);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    });
    if (result.canceled || result.assets.length === 0) return;
    const asset = result.assets[0];
    setImage({
      uri: asset.uri,
      name: asset.fileName ?? 'post.jpg',
      type: asset.mimeType ?? 'image/jpeg',
    });
  }

  async function handlePublish() {
    const trimmed = body.trim();
    if (!trimmed && !image) {
      setError('Write something or attach an image.');
      return;
    }
    setError(null);
    setPublishing(true);
    try {
      if (trimmed) {
        const post = await createPost.mutateAsync(trimmed);
        if (image) {
          await addPostImage(identifier, post.id, image);
        }
      } else if (image) {
        // A post must exist before an image can be attached — create a shell
        // with the image as its first content.
        const post = await createPost.mutateAsync(' ');
        await addPostImage(identifier, post.id, image);
      }
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
        <Text style={styles.title}>New post in {channel?.name ?? 'channel'}</Text>

        <View style={styles.field}>
          <Text style={styles.label}>Message</Text>
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="Share an update…"
            placeholderTextColor={colors.savannaMuted}
            maxLength={2000}
            multiline
            style={[styles.input, styles.multiline]}
            accessibilityLabel="Post message"
          />
          <Text style={styles.counter}>{body.length}/2000</Text>
        </View>

        {image ? (
          <View style={styles.imageWrap}>
            <Image source={{ uri: image.uri }} style={styles.image} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Remove attached image"
              onPress={() => setImage(null)}
              style={styles.removeImage}
            >
              <Text style={styles.removeImageText}>×</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Attach an image"
            onPress={() => void handlePickImage()}
            style={styles.attachButton}
          >
            <Text style={styles.attachButtonText}>+ Add image</Text>
          </Pressable>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button onPress={() => void handlePublish()} loading={publishing}>
          Publish
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
    minHeight: 120,
    textAlignVertical: 'top',
  },
  counter: {
    color: colors.savannaMuted,
    fontSize: 12,
    textAlign: 'right',
  },
  imageWrap: {
    position: 'relative',
  },
  image: {
    width: '100%',
    height: 180,
    borderRadius: radius.md,
  },
  removeImage: {
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
  removeImageText: {
    color: colors.kenteGold,
    fontSize: 18,
    lineHeight: 20,
    fontWeight: '700',
  },
  attachButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.kenteGold,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  attachButtonText: {
    color: colors.kenteGold,
    fontSize: 14,
    fontWeight: '600',
  },
  error: {
    color: colors.terracotta,
    fontSize: 14,
  },
});
