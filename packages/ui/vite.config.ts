import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/clawlens/',
  build: {
    outDir: '../plugin/dist/ui',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'chart-vendor': ['recharts', 'd3'],
        },
      },
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/clawlens/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
});
