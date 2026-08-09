const mockSecureStore = {
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
};

jest.mock('expo-secure-store', () => ({
  __esModule: true,
  ...mockSecureStore,
  default: mockSecureStore,
}));

jest.mock('expo-application', () => ({
  __esModule: true,
  getAndroidId: jest.fn(() => 'test-android-id'),
  default: { getAndroidId: jest.fn(() => 'test-android-id') },
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: { extra: {} },
  },
}));

jest.mock('react-native-safe-area-context', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mock = require('react-native-safe-area-context/jest/mock') as { default?: unknown };
  return mock.default ?? mock;
});

jest.mock('expo-contacts', () => ({
  __esModule: true,
  getPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  Contact: {
    getAllDetails: jest.fn(async () => []),
  },
  ContactField: {
    GIVEN_NAME: 'givenName',
    FAMILY_NAME: 'familyName',
    PHONES: 'phones',
  },
  ContactsSortOrder: { GivenName: 'givenName' },
}));

// @expo/vector-icons loads icon fonts via expo-font/expo-asset, which isn't
// wired into the Jest asset registry. Stub the icon components (interactive
// elements carry their own accessibility labels on the Pressable, so the icon
// glyph itself is not needed in tests) to avoid hitting the font loader.
jest.mock('@expo/vector-icons', () => {
  const stub = () => null;
  return {
    __esModule: true,
    Ionicons: stub,
    MaterialCommunityIcons: stub,
    Feather: stub,
  };
});

// expo-video renders a native-backed <VideoView> and creates a native player.
// In Jest it has no native module, so stub the hook + view (the StoryViewer's
// video path is asserted via the surrounding UI, not actual playback).
jest.mock('expo-video', () => ({
  __esModule: true,
  useVideoPlayer: jest.fn(() => ({ play: jest.fn(), pause: jest.fn(), loop: false })),
  VideoView: () => null,
}));
