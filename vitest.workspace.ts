import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'packages/plugin/vitest.config.ts',
  'packages/ui/vitest.config.ts',
  'tests/vitest.config.ts',
]);
