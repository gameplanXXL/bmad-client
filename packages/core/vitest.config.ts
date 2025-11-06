import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Disable file watching by default
    watch: false,
    // Run tests sequentially to avoid memory issues
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    // Set reasonable timeouts
    testTimeout: 10000,
    hookTimeout: 10000,
    // Clear mocks between tests
    clearMocks: true,
    // Enable isolation to prevent mock conflicts
    isolate: true,
    // Better error messages
    reporters: ['default'],
  },
});
