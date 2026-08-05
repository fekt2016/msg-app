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

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = identifier.trim().length >= 3 && password.length >= 8;

  async function handleSubmit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await login({ identifier: identifier.trim(), password });
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthScreenShell
      title="Welcome back."
      subtitle="Log in to pick up where your community left off."
    >
      <FormField
        label="Email or phone"
        value={identifier}
        onChangeText={setIdentifier}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="emailAddress"
        returnKeyType="next"
      />
      <FormField
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="password"
        returnKeyType="done"
        onSubmitEditing={() => void handleSubmit()}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button onPress={() => void handleSubmit()} disabled={!canSubmit} loading={submitting}>
        Log in
      </Button>
      <Pressable
        accessibilityRole="button"
        onPress={() => navigation.navigate('Register')}
        style={styles.linkWrap}
      >
        <Text style={styles.link}>
          New here? <Text style={styles.linkAccent}>Create an account</Text>
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
