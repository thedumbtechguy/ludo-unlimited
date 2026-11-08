import { cloudflareTest } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [cloudflareTest({ miniflare: { compatibilityDate: '2026-11-01' } })],
  test: { include: ['test/**/*.test.ts'] },
})
