import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import { FormField } from '../components/FormField';
import { apiErrorMessage } from '../api/client';
import { updateMyProfile, uploadAvatar } from '../api/users';
import type { AppStackParamList } from '../navigation/types';
import { colors, radius, spacing } from '../theme/tokens';

export function ProfileScreen() {
  const { user, logout, refreshProfile } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();

  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const avatarUrl = user?.avatar?.url ?? null;

  useEffect(() => {
    if (!user) return;
    setDisplayName(user.displayName ?? '');
    setBio(user.bio ?? '');
  }, [user?.id, user?.displayName, user?.bio]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await updateMyProfile({ displayName: displayName.trim(), bio: bio.trim() });
      await refreshProfile();
      setSuccess(true);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handlePickAvatar() {
    setError(null);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || result.assets.length === 0) return;

    const asset = result.assets[0];
    setUploading(true);
    try {
      await uploadAvatar({
        uri: asset.uri,
        name: asset.fileName ?? 'avatar.jpg',
        type: asset.mimeType ?? 'image/jpeg',
      });
      await refreshProfile();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>E A Z C O M M U N I T Y</Text>
        <Text style={styles.title}>Profile</Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Change profile photo"
          onPress={() => void handlePickAvatar()}
          style={styles.avatarWrap}
        >
          {uploading ? (
            <View style={styles.avatarPlaceholder}>
              <ActivityIndicator color={colors.kenteGold} />
            </View>
          ) : avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitial}>
                {(user?.displayName ?? '?').charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <Text style={styles.avatarHint}>Tap to change photo</Text>
        </Pressable>

        <FormField label="Display name" value={displayName} onChangeText={setDisplayName} />

        <View style={styles.bioWrap}>
          <Text style={styles.label}>Bio</Text>
          <TextInput
            value={bio}
            onChangeText={setBio}
            placeholder="A short line about you"
            placeholderTextColor={colors.savannaMuted}
            maxLength={160}
            multiline
            style={[styles.bioInput, styles.textBase]}
            accessibilityLabel="Bio"
          />
          <Text style={styles.counter}>{bio.length}/160</Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {success ? <Text style={styles.success}>Profile saved.</Text> : null}

        <Button onPress={() => void handleSave()} loading={saving} disabled={!displayName.trim()}>
          Save profile
        </Button>

        <View style={styles.securitySection}>
          <Text style={styles.sectionTitle}>Security</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Set up recovery key"
            onPress={() => navigation.navigate('RecoveryKeySetup')}
            style={styles.securityRow}
          >
            <Text style={styles.securityRowText}>Recovery key backup</Text>
            <Text style={styles.securityRowChevron}>›</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Restore from recovery phrase"
            onPress={() => navigation.navigate('RestoreRecovery')}
            style={styles.securityRow}
          >
            <Text style={styles.securityRowText}>Restore history from recovery phrase</Text>
            <Text style={styles.securityRowChevron}>›</Text>
          </Pressable>
        </View>

        <Pressable accessibilityRole="button" onPress={() => void logout()} style={styles.logout}>
          <Text style={styles.logoutText}>Log out</Text>
        </Pressable>
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
    paddingTop: spacing.xxl,
    gap: spacing.md,
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
    marginBottom: spacing.sm,
  },
  avatarWrap: {
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  avatar: {
    width: 112,
    height: 112,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.kenteGold,
  },
  avatarPlaceholder: {
    width: 112,
    height: 112,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.inputBorder,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.inputSurface,
  },
  avatarInitial: {
    color: colors.kenteGold,
    fontSize: 44,
    fontWeight: '800',
  },
  avatarHint: {
    color: colors.savannaMuted,
    fontSize: 13,
  },
  label: {
    color: colors.savanna,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  bioWrap: {
    gap: spacing.xs,
  },
  bioInput: {
    backgroundColor: colors.inputSurface,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    color: colors.savanna,
    minHeight: 96,
    textAlignVertical: 'top',
  },
  textBase: {
    fontSize: 16,
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
  success: {
    color: colors.kenteGold,
    fontSize: 14,
  },
  securitySection: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  sectionTitle: {
    color: colors.savannaMuted,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  securityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.inputSurface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  securityRowText: {
    color: colors.savanna,
    fontSize: 15,
    flex: 1,
  },
  securityRowChevron: {
    color: colors.kenteGold,
    fontSize: 20,
    fontWeight: '700',
  },
  logout: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
  },
  logoutText: {
    color: colors.terracotta,
    fontSize: 15,
    fontWeight: '600',
  },
});
