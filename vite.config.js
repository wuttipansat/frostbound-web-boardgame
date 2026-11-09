import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 700,
    // Step 22: three.js in its own long-cached chunk; post-processing is a lazy chunk (render/post.js).
    rollupOptions: { output: { manualChunks: (id) => (id.includes('node_modules/three/') && !id.includes('/postprocessing/') && !id.includes('/shaders/') ? 'three' : undefined) } },
  },
});
