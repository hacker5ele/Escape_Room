import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Shuts down the HTTP servers each test started. See `src/test/server.ts`
    // for why the tests own a server at all.
    setupFiles: ['./src/test/setup.ts'],
  },
})
