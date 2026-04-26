/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/voyage-tracker/',
  test: {
    // Vitest hosts the unit tests under src/. Playwright owns tests/e2e and
    // ships its own runner — keep them out of Vitest's discovery.
    exclude: ['node_modules', 'dist', 'tests/e2e/**'],
  },
})
