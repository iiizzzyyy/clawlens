import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'dist/**',
        'tests/**',
        '**/*.d.ts',
        '**/*.config.*',
        '**/node_modules/**',
        'src/main.tsx', // Entry point, hard to test
      ],
      thresholds: {
        lines: 70,
        functions: 65,
        branches: 60,
        statements: 70,
      },
    },
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 10000,
  },
});
