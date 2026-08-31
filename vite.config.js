import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// package.json has "type": "module", so this config runs as ESM — __dirname
// isn't defined there the way it is in CommonJS, hence deriving it from
// import.meta.url instead.
const __dirname = dirname(fileURLToPath(import.meta.url));

// Any client-exposed env var must be prefixed VITE_ (e.g. VITE_SUPABASE_URL) — see .env.example
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      // Multi-page build: index.html is the main chat app (src/main.jsx ->
      // App.jsx -> Home.jsx), admin.html is the fully standalone admin
      // panel (src/admin-main.jsx -> AdminPanel.jsx directly, no App.jsx/
      // Home.jsx in its module graph at all). Vite/Rollup will still
      // dedupe genuinely shared modules (React, supabaseClient, tokens.css,
      // etc.) into common chunks, but the admin panel's own page code is
      // never bundled into — or loaded by — the main app's entry, and
      // vice versa.
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html'),
      },
    },
  },
});
