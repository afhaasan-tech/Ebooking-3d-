import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': { target: process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:8787', changeOrigin: false } },
  },
  preview: {
    proxy: { '/api': { target: process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:8787', changeOrigin: false } },
  },
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        // Function form: only the 3D libraries go into the lazy `three` chunk.
        // (The object form also pulled shared deps such as React into it, so every route preloaded ~1.1 MB.)
        manualChunks(id) {
          // Vite's lazy-import helper is needed by the entry; keep it out of the 3D chunk
          if (id.includes('vite/preload-helper') || id.includes('commonjsHelpers')) return 'react';
          if (/[\\/]node_modules[\\/](three|three-stdlib|@react-three|troika-[^\\/]+|camera-controls|maath|meshline|stats-gl|@monogrid)[\\/]/.test(id)) return 'three';
          // React must live in its own chunk; otherwise Rollup hoists it into `three` (a dependency of that chunk)
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom)[\\/]/.test(id)) return 'react';
        },
      },
    },
  },
});
