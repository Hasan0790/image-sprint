import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  worker: { format: 'es' },
  server: { host: '127.0.0.1', port: 5176, strictPort: true, watch: { usePolling: true, interval: 700, ignored: ['**/release/**', '**/test-output/**', '**/.local/**'] } },
  build: { target: 'chrome134', chunkSizeWarningLimit: 1600 },
});
