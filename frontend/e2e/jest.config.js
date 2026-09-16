/**
 * Jest runner config for Detox E2E tests only.
 *
 * This is intentionally separate from the unit-test config (../jest.config.js):
 * it uses Detox's jest environment/setup and transpiles the TS specs with
 * ts-jest. The unit run excludes the e2e/ folder so these never execute under
 * `pnpm test`.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  rootDir: '..',
  testMatch: ['<rootDir>/e2e/**/*.test.ts'],
  testTimeout: 120000,
  maxWorkers: 1,
  globalSetup: 'detox/runners/jest/globalSetup',
  globalTeardown: 'detox/runners/jest/globalTeardown',
  reporters: ['detox/runners/jest/reporter'],
  testEnvironment: 'detox/runners/jest/testEnvironment',
  verbose: true,
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/e2e/tsconfig.json' }],
  },
};
