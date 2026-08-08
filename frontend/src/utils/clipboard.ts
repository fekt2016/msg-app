import { requireOptionalNativeModule } from 'expo-modules-core';

/**
 * Copy text to the clipboard, degrading gracefully when the native
 * ExpoClipboard module isn't available (e.g. an Expo Go build that doesn't
 * bundle it, or a dev build made before expo-clipboard was added).
 *
 * We deliberately do NOT import the `expo-clipboard` package: its module body
 * runs `requireNativeModule('ExpoClipboard')` at import time, which *throws* when
 * the native module is missing — and Metro's dev module loader surfaces that as
 * a red box even inside a try/catch. `requireOptionalNativeModule` probes the
 * native registry instead, returning `null` (never throwing) when absent, so a
 * missing clipboard degrades to a no-op the caller can fall back on.
 */
type ClipboardNativeModule = {
  setStringAsync(text: string, options?: Record<string, unknown>): Promise<boolean>;
};

const ExpoClipboard = requireOptionalNativeModule<ClipboardNativeModule>('ExpoClipboard');

export function isClipboardAvailable(): boolean {
  return ExpoClipboard != null && typeof ExpoClipboard.setStringAsync === 'function';
}

export async function copyToClipboard(value: string): Promise<boolean> {
  if (!isClipboardAvailable()) {
    return false;
  }
  try {
    await ExpoClipboard!.setStringAsync(value, {});
    return true;
  } catch {
    // Native call failed at runtime: signal the caller so it can fall back to
    // showing the raw value rather than surfacing an error.
    return false;
  }
}
