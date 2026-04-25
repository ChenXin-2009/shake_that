import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
  plugins: [basicSsl()],
  server: {
    host: '0.0.0.0',
    port: 3002,
    https: true
  },
  build: {
    target: 'es2015',
    outDir: 'dist',
    minify: false
  }
});
