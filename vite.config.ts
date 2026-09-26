import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    port: 5173,
    host: true,
    allowedHosts: true,
    // Local dev: point VITE_DIALOGUE_API=/api and VITE_DIRECTOR_API=/api/director at the server in ./server
    proxy: { '/api': { target: 'http://localhost:8787', rewrite: (p) => p.replace(/^\/api/, '') } },
  },
});
