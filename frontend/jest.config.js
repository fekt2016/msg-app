module.exports = {
  preset: 'jest-expo',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@nozbe/watermelondb/adapters/sqlite$': '<rootDir>/src/db/testing/sqliteStub.ts',
  },
  testMatch: ['**/__tests__/**/*.test.ts?(x)', '**/?(*.)+(test).ts?(x)'],
  setupFiles: ['<rootDir>/jest.setup.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@nozbe)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|@noble/.*)',
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
