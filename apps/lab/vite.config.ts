import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Servido pelo mesmo servidor do Ritmo 180, em /laboratorio/. As rotas internas usam #hash.
export default defineConfig({
  base: '/laboratorio/',
  plugins: [react(), tailwindcss()],
  server: { port: 5190 },
  // Fontes sempre como arquivo: a política de segurança do Ritmo (font-src 'self') bloqueia fontes em data:.
  build: { outDir: 'dist', emptyOutDir: true, assetsInlineLimit: (file) => (/\.woff2?$/.test(file) ? false : undefined) },
});
