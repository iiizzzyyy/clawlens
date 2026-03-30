import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: false,
  splitting: false,
  treeshake: true,
  external: ['openclaw', 'better-sqlite3'],
});
