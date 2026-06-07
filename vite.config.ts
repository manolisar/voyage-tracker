/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/voyage-tracker/',
  test: {
    // Vitest hosts the unit tests under src/. Playwright owns tests/e2e and
    // ships its own runner — keep them out of Vitest's discovery. Patterns are
    // **-anchored so nested copies (e.g. linked git worktrees registered under
    // .claude/worktrees/) don't leak their e2e specs into the unit run.
    exclude: ['**/node_modules/**', '**/dist/**', '**/tests/e2e/**', '.claude/**'],
  },
})
