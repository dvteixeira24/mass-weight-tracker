import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // Dev only: `vite preview` runs in production mode and must stay a plain static server.
  server: {
    proxy: mode === 'development' ? { '/api': 'http://127.0.0.1:8787' } : undefined,
  },
}));
