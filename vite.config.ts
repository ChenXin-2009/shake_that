import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 3002,
    https: false
  },
  build: {
    target: 'es2015',
    outDir: 'dist',
    minify: false
  }
});
