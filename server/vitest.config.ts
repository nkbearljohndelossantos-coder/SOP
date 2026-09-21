import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 20000,
    hookTimeout: 20000,
    env: {
      APP_ENV: 'test',
      ENABLE_DEMO_ACCOUNTS: 'true',
    },
  },
});
