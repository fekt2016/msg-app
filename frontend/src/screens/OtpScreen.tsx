import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../navigation/types';
import { AuthScreenShell } from '../components/AuthScreenShell';
import { Button } from '../components/Button';
import { useAuth } from '../auth/AuthContext';
import { apiErrorMessage } from '../api/client';
import { colors, radius, spacing } from '../theme/tokens';

type Props = NativeStackScreenProps<AuthStackParamList, 'VerifyOtp'>;

const CODE_LENGTH = 6;
const RESEND_COOLDOWN = 30;

export function OtpScreen({ route, navigation }: Props) {
  const { identifier, purpose } = route.params;
  const { verifyOtp, resendOtp } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const canSubmit = code.length === CODE_LENGTH;

  async function handleSubmit(codeToVerify: string = code) {
    if (codeToVerify.length !== CODE_LENGTH || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await verifyOtp({ identifier, purpose, code: codeToVerify });
      // Successfully authenticated — navigation swaps to the app root.
    } catch (err) {
      setError(apiErrorMessage(err));
      setCode('');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    if (resending || cooldown > 0) return;
    setResending(true);
    setError(null);
    try {
      await resendOtp({ identifier, purpose });
      setCooldown(RESEND_COOLDOWN);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthScreenShell title="Verify it's you." subtitle={`We sent a 6-digit code to ${identifier}.`}>
      <View>
        <Text style={styles.label}>Verification code</Text>
        <TextInput
          ref={inputRef}
          value={code}
          onChangeText={(text) => {
            const digits = text.replace(/[^0-9]/g, '').slice(0, CODE_LENGTH);
            setCode(digits);
            if (digits.length === CODE_LENGTH) {
              void handleSubmit(digits);
            }
          }}
          style={styles.codeInput}
          keyboardType="number-pad"
          maxLength={CODE_LENGTH}
          autoFocus
          accessibilityLabel="6-digit verification code"
        />
        <Text style={styles.hint}>
          {code.length}/{CODE_LENGTH} digits
        </Text>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button onPress={() => void handleSubmit()} disabled={!canSubmit} loading={submitting}>
        Verify code
      </Button>
      <View style={styles.resendWrap}>
        <Button
          variant="secondary"
          onPress={() => void handleResend()}
          disabled={cooldown > 0}
          loading={resending}
        >
          {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
        </Button>
        <Text style={styles.backLink} onPress={() => navigation.goBack()}>
          Use a different account
        </Text>
      </View>
    </AuthScreenShell>
  );
}

const styles = StyleSheet.create({
  label: {
    color: colors.savanna,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  codeInput: {
    backgroundColor: colors.inputSurface,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 16,
    color: colors.kenteGold,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 12,
    textAlign: 'center',
  },
  hint: {
    color: colors.savannaMuted,
    fontSize: 13,
    marginTop: spacing.sm,
    textAlign: 'right',
  },
  error: {
    color: colors.terracotta,
    fontSize: 14,
  },
  resendWrap: {
    gap: spacing.md,
    alignItems: 'center',
  },
  backLink: {
    color: colors.savannaMuted,
    fontSize: 15,
    textDecorationLine: 'underline',
  },
});
