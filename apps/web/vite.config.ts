import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react(), tailwind()],
  optimizeDeps: { include: ['echarts/core', 'echarts/charts', 'echarts/components', 'echarts/renderers'] },
  server: { host: '127.0.0.1', port: 5173, proxy: { '/api': 'http://127.0.0.1:3100' } },
  preview: { host: '127.0.0.1', port: 5173, proxy: { '/api': 'http://127.0.0.1:3100' } },
  build: {
    outDir: '../../dist/web', emptyOutDir: true,
    rollupOptions: { output: { manualChunks: {
      react: ['react', 'react-dom'], temporal: ['@js-temporal/polyfill'], storage: ['dexie'],
    } } },
  },
});
