import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { ViteImageOptimizer } from 'vite-plugin-image-optimizer'
import legacy from '@vitejs/plugin-legacy'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    react(),
    legacy({
      targets: ['chrome >= 55', 'Android >= 6', 'not IE 11'],
    }),
    ViteImageOptimizer({
      test: /\.(jpe?g|png|gif|tiff|webp|svg|avif)$/i,
      png: { quality: 80 },
    }),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [], // Files already covered by globPatterns below
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        // Ensure version.json and sitemap are never cached
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/darycommerce\.com\/version\.json.*/i,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /\/version\.json/i,
            handler: 'NetworkOnly',
          }
        ]
      },
      manifest: {
        name: 'DARY CARD',
        short_name: 'DARY',
        description: 'Дигитална Идентичност в Една Карта',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: 'pwa-icon.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-icon.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-icon.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
  define: {
    'import.meta.resolve': '(undefined)',
  },
  build: {
    target: 'es2015',
    modulePreload: false,
  }
})
