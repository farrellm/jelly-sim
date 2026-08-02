import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * The client only ever uses relative URLs, so whatever serves it must also answer /api on
 * the same origin — otherwise the SameSite=Lax session cookie is never sent (DESIGN.md
 * §14). In production that is a Cloudflare Pages Function; locally it is this proxy, and
 * both the dev server and `vite preview` need it. Shared rather than copied so the two
 * cannot drift.
 */
const apiProxy = {
  '/api': { target: 'http://localhost:3000', changeOrigin: false },
};

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
    proxy: apiProxy,
    // Vite refuses requests whose Host header it does not recognise, which otherwise makes
    // the dev server unreachable under a public hostname. This one exists so the game can
    // be opened on a real iPhone — the half of the Phase 0 exit criterion (§15) that
    // localhost cannot prove.
    allowedHosts: ['jelly-sim.duckdns.org'],
  },
  // `make start` serves the built app from here, so it needs the same port and the same
  // proxy as the dev server. vite preview inherits neither.
  preview: {
    port: 5273,
    strictPort: true,
    proxy: apiProxy,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
