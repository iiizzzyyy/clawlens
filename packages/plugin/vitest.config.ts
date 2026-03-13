import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'dist/**',
        'tests/**',
        'fixtures/**',
        '**/*.d.ts',
        '**/*.config.*',
        '**/node_modules/**',
      ],
      thresholds: {
        lines: 80,
        functions: 75,
        branches: 70,
        statements: 80,
      },
    },
    setupFiles: [],
    testTimeout: 10000,
  },
});
