module.exports = {
  preset: 'jest-expo',
  testEnvironment: 'node',
  // The heavy screen/E2EE suites (ChatScreen, GroupChatScreen, HomeScreen) run
  // real crypto mocks + many async `waitFor`s under v8 coverage instrumentation.
  // With unbounded workers (jest's default = one per core) on a busy CI runner,
  // those tests starve the event loop and exceed the 5000ms default timeout —
  // flaky in CI, green in isolation. Cap parallelism to halve contention and
  // give each test real headroom so the run is deterministic everywhere.
  maxWorkers: '50%',
  testTimeout: 15000,
  moduleNameMapper: {
    '^@nozbe/watermelondb/adapters/sqlite$': '<rootDir>/src/db/testing/sqliteStub.ts',
  },
  testMatch: ['**/__tests__/**/*.test.ts?(x)', '**/?(*.)+(test).ts?(x)'],
  setupFiles: ['<rootDir>/jest.setup.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@nozbe)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|@noble/.*|@scure/.*)',
  ],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', 'App.tsx', '!**/*.test.ts?(x)'],
  coverageProvider: 'v8',
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'json-summary', 'html'],
  coverageThreshold: {
    global: {
      lines: 70,
      functions: 70,
      branches: 60,
      statements: 70,
    },
  },
};
