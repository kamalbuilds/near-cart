import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'web',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./web', import.meta.url)) } },
  server: {
    host: '127.0.0.1',
    proxy: { '/api': 'http://127.0.0.1:4174' },
  },
  build: { outDir: '../dist', emptyOutDir: true },
});
