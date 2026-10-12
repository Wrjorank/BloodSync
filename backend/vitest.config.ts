import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // the smoke suite talks to a running server and skips itself unless API_URL is set
    testTimeout: 15000,
  },
});
