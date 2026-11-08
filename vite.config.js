import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { target: 'es2020', chunkSizeWarningLimit: 900 },
  // `npm start` runs the online server; in dev, vite forwards the room socket to it.
  server: { proxy: { '/ws': { target: 'ws://localhost:8787', ws: true } } },
});
