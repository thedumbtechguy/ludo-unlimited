import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'icon.svg'],
      workbox: {
        // The sound effects are small and precached so they work offline. The music is too big to
        // precache: it's fetched when a game first starts and cached from then on.
        globPatterns: ['**/*.{js,wasm,css,html}', 'audio/*.{webm,m4a}'],
        globIgnores: ['audio/music.*'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/audio/'),
            handler: 'CacheFirst',
            options: { cacheName: 'audio', expiration: { maxEntries: 40 } },
          },
        ],
      },
      manifest: {
        name: 'Ludo Unlimited',
        short_name: 'Ludo Unlimited',
        description: 'Ludo with Ghanaian kicks',
        theme_color: '#FFFFFF',
        background_color: '#FFFFFF',
        display: 'standalone',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
