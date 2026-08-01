import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false, // public/manifest.webmanifest is checked in and linked from index.html
      workbox: {
        // The shell, sprites, and audio are precached so the app *opens* offline and can
        // show the waiting screen (§10.5). The game itself needs the server.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  server: {
    // Not Vite's default 5173, which is usually already taken on a machine with other
    // projects on it. strictPort because a dev server that silently moves ports lands on
    // an origin the API's allowlist does not know, and the failure looks like a CSRF bug
    // rather than a port collision.
    port: 5273,
    strictPort: true,
    // Same-origin in development so the session cookie behaves exactly as it does in
    // production, where the API sits behind the same hostname.
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: false },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
