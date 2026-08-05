import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    env: {
      NODE_ENV: 'test',
      MONGODB_URL: 'mongodb://localhost:27017/eaz_community_test',
      REDIS_URL: 'redis://localhost:6379',
      // Tests never require a real Redis: the config-driven factory/store select
      // in-memory, and the Redis-specific suites instantiate the Redis classes
      // directly with a mocked `redis` client.
      REDIS_ENABLED: 'false',
      TYPESENSE_ENABLED: 'false',
      TYPESENSE_URL: 'http://localhost:8108',
      TYPESENSE_API_KEY: 'dev-typesense-key',
      JWT_SECRET: 'test-secret-at-least-thirty-two-characters-long',
      JWT_REFRESH_SECRET: 'test-refresh-secret-at-least-thirty-two-characters-long',
    },
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/**/*.test.ts', 'src/**/swagger.ts'],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
        statements: 70,
      },
    },
  },
});
