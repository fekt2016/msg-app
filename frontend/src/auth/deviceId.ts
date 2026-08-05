import * as SecureStore from 'expo-secure-store';
import * as Application from 'expo-application';
import { Platform } from 'react-native';

const DEVICE_ID_KEY = 'eaz_device_id';

export async function getDeviceId(): Promise<string> {
  const stored = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (stored) return stored;

  const androidId = Platform.OS === 'android' ? Application.getAndroidId() : null;
  const generated =
    androidId || `${Platform.OS}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  await SecureStore.setItemAsync(DEVICE_ID_KEY, generated);
  return generated;
}
