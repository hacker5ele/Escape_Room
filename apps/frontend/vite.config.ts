import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],

  server: {
    port: 5173,
    // The frontend calls the relative path /api and this forwards it to the
    // backend. In production nginx does the same thing, so the app never has a
    // backend URL compiled into it and both environments are same-origin.
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },

  optimizeDeps: {
    // @escape-room/shared is a workspace package that we rebuild while working.
    // Excluding it from pre-bundling means those rebuilds show up immediately.
    exclude: ['@escape-room/shared'],
  },

  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
