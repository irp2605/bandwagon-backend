import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./src/test/setup.js'],
    testMatch: ['**/__tests__/**/*.test.js', '**/tests/**/*.test.js'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: [
        'src/migrations/**',
        'src/test/**',
        'node_modules/**'
      ]
    },
    // Run tests sequentially to avoid database conflicts
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true
      }
    }
  }
});