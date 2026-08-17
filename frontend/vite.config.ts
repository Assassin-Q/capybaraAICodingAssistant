import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://localhost:10001',
        changeOrigin: true,
        ws: true,
        secure: false,
      },
      // Browser-based QA cannot always connect to arbitrary localhost ports directly. This
      // development-only path keeps OpenCode requests same-origin without changing JCEF runtime.
      '/opencode': {
        target: process.env.VITE_OPENCODE_PROXY_TARGET || 'http://127.0.0.1:12001',
        changeOrigin: true,
        ws: true,
        secure: false,
        rewrite: (requestPath) => requestPath.replace(/^\/opencode/, ''),
      },
    },
  },
  build: {
    outDir: '../idea-plugin/src/main/resources/static',
    emptyOutDir: true,
  },
})
