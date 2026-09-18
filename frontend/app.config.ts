import type { ConfigContext, ExpoConfig } from 'expo/config';

// The API base URL and EAS project id differ per runtime:
//  - Android emulator reaches the host via 10.0.2.2 (default),
//  - physical devices need the host's LAN IP, set via EXPO_PUBLIC_API_URL,
//  - expo-notifications getExpoPushTokenAsync requires the EAS project id
//    (EXPO_PUBLIC_EAS_PROJECT_ID, from `eas init` / the Expo dashboard) —
//    in SDK 53+ it can no longer be inferred from the manifest in a dev build.
export default ({ config }: ConfigContext): ExpoConfig => {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:5000/api/v1';
  const easProjectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  return {
    ...(config as ExpoConfig),
    extra: {
      ...(config.extra ?? {}),
      API_URL: apiUrl,
      ...(easProjectId ? { eas: { projectId: easProjectId } } : {}),
    },
  };
};
