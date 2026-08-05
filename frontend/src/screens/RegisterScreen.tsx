import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../navigation/types';
import { AuthScreenShell } from '../components/AuthScreenShell';
import { Button } from '../components/Button';
import { FormField } from '../components/FormField';
import { useAuth } from '../auth/AuthContext';
import { apiErrorMessage } from '../api/client';
import { colors } from '../theme/tokens';

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

export function RegisterScreen({ navigation }: Props) {
  const { registerAndSendOtp } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit =
    identifier.trim().length >= 3 && displayName.trim().length >= 1 && password.length >= 8;

  async function handleSubmit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await registerAndSendOtp({
        identifier: identifier.trim(),
        password,
        displayName: displayName.trim(),
      });
      navigation.navigate('VerifyOtp', {
        identifier: identifier.trim(),
        purpose: 'VERIFY',
      });
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthScreenShell
      title="Create your account."
      subtitle="Join your community on a platform built for Ghana and Africa."
    >
      <FormField
        label="Phone number"
        value={identifier}
        onChangeText={setIdentifier}
        placeholder="0241234567"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        returnKeyType="next"
      />
      <FormField
        label="Display name"
        value={displayName}
        onChangeText={setDisplayName}
        autoCorrect={false}
        textContentType="nickname"
        returnKeyType="next"
      />
      <FormField
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="newPassword"
        returnKeyType="done"
        onSubmitEditing={() => void handleSubmit()}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button onPress={() => void handleSubmit()} disabled={!canSubmit} loading={submitting}>
        Create account
      </Button>
      <Pressable
        accessibilityRole="button"
        onPress={() => navigation.navigate('Login')}
        style={styles.linkWrap}
      >
        <Text style={styles.link}>
          Already have an account? <Text style={styles.linkAccent}>Log in</Text>
        </Text>
      </Pressable>
    </AuthScreenShell>
  );
}

const styles = StyleSheet.create({
  error: {
    color: colors.terracotta,
    fontSize: 14,
  },
  linkWrap: {
    alignItems: 'center',
  },
  link: {
    color: colors.savannaMuted,
    fontSize: 15,
  },
  linkAccent: {
    color: colors.kenteGold,
    fontWeight: '700',
  },
});
