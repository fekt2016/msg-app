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
