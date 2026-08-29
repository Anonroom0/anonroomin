import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Any client-exposed env var must be prefixed VITE_ (e.g. VITE_SUPABASE_URL) — see .env.example
export default defineConfig({
  plugins: [react()],
});
