import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react(), tailwind(), {
    name: 'offline-shell', apply: 'build',
    async closeBundle() {
      const output = fileURLToPath(new URL('../../dist/web/', import.meta.url));
      const files = ['index.html', 'icon.svg', 'manifest.webmanifest', ...(await readdir(resolve(output, 'assets'))).map(name => `assets/${name}`)].sort();
      const template = await readFile(new URL('./public/sw.js', import.meta.url), 'utf8');
      const hash = createHash('sha256').update(template);
      for (const name of files) hash.update(name).update(await readFile(resolve(output, name)));
      await writeFile(resolve(output, 'sw.js'), template.replace('__BUILD_ID__', hash.digest('hex').slice(0, 16)).replace('__SHELL_FILES__', JSON.stringify(files.map(name => name === 'index.html' ? '/' : `/${name}`))));
    },
  }],
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
