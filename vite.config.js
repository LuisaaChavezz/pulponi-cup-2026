import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Raíz explícita (evita fallos en CI/Vercel si cwd ≠ carpeta del proyecto)
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: __dirname,
  publicDir: path.join(__dirname, 'public'),
  plugins: [react()],
  build: {
    outDir: path.join(__dirname, 'dist'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
  },
});
