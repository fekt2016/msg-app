import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { colors, radius, spacing } from '../theme/tokens';

interface FormFieldProps extends TextInputProps {
  label: string;
  error?: string;
}

export function FormField({ label, error, style, ...props }: FormFieldProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.savannaMuted}
        style={[styles.input, error && styles.inputError, style]}
        {...props}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
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
  inputError: {
    borderColor: colors.terracotta,
  },
  error: {
    color: colors.terracotta,
    fontSize: 13,
  },
});
