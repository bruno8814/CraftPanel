import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite es el "empaquetador" que compila tu código React/TypeScript
// y lo sirve en un servidor de desarrollo con recarga en caliente.
// Cuando cambias un archivo, la página se actualiza sola al instante.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Proxy: cuando el frontend hace una petición a /api/...,
    // Vite la redirige automáticamente al backend en el puerto 3000.
    // Así evitamos problemas de CORS durante el desarrollo.
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true, // Importante: habilitar WebSocket en el proxy
      },
    },
  },
});
