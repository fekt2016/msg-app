import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, type PressableProps } from 'react-native';
import { colors, radius } from '../theme/tokens';

interface ButtonProps extends Omit<PressableProps, 'children'> {
  children: ReactNode;
  variant?: 'primary' | 'secondary';
  loading?: boolean;
}

export function Button({
  children,
  variant = 'primary',
  loading = false,
  disabled,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      {...props}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' ? styles.primary : styles.secondary,
        pressed && styles.pressed,
        isDisabled && styles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.baobab : colors.savanna} />
      ) : (
        <Text style={variant === 'primary' ? styles.primaryText : styles.secondaryText}>
          {children}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.full,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primary: {
    backgroundColor: colors.kenteGold,
  },
  secondary: {
    borderWidth: 1,
    borderColor: colors.inputBorder,
  },
  primaryText: {
    color: colors.baobab,
    fontSize: 17,
    fontWeight: '700',
  },
  secondaryText: {
    color: colors.savanna,
    fontSize: 17,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.5,
  },
});
