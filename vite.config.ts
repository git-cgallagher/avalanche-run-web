import { defineConfig } from 'vite';

// Relative asset paths so the same build works inside Tauri, on a subpath host, or opened from disk.
export default defineConfig({
  base: './',
  clearScreen: false,
  // The preview tooling passes PORT; Tauri's devUrl expects 5173 otherwise.
  server: { port: Number(process.env.PORT) || 5173, strictPort: true },
  build: { target: 'es2022', outDir: 'dist' },
});
