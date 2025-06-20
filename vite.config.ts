/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tsconfigPaths from 'vite-tsconfig-paths'

// https://vitejs.dev/config https://vitest.dev/config
export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  server: {
    port: 5173,
    strictPort: true // fail if port 5173 is taken
  },
  build: {
    target: 'esnext', // Support top-level await
    rollupOptions: {
      output: {
        format: 'es'
      }
    }
  },
  esbuild: {
    target: 'esnext' // Support top-level await in development
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext' // Support top-level await in dependencies
    }
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: '.vitest/setup',
    include: ['**/test.{ts,tsx}']
  }
})
