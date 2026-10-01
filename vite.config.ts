import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // Phaser includes its physics/rendering systems in one large engine module.
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: { manualChunks: { phaser: ['phaser'] } },
    },
  },
});
