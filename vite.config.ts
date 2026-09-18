import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { ViteImageOptimizer } from 'vite-plugin-image-optimizer'
import legacy from '@vitejs/plugin-legacy'
import { VitePWA } from 'vite-plugin-pwa'
// The generated line pages read the same data the app renders, so a timetable
// or price edit lands on them with the next build.
import { ROUTE_METADATA, cardPrice, disabledDiscountPct, listedRoutes } from './src/data/routeMetadata'
import { SCHEDULES } from './src/data/schedules'
import { routeSlug } from './src/data/routeSlugs'
import { HOLIDAYS_2026 } from './src/utils/holidays'
import { generateLinePages } from './scripts/generate-line-pages.mjs'

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [
    react(),
    legacy({
      targets: ['chrome >= 55', 'Android >= 6', 'not IE 11'],
    }),
    ViteImageOptimizer({
      test: /\.(jpe?g|png|gif|tiff|webp|svg|avif)$/i,
      // Skip lossy PNG quantization for brand logos and app icons — the palette
      // reduction at quality 80 blurs their anti-aliased edges/gradients. Regex
      // matches the full path so it also catches hashed asset names (logo_main-<hash>.png).
      exclude: /(logo|pwa-icon|apple-touch-icon|favicon)/i,
      png: { quality: 80 },
    }),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [], 
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg}'], // Only core files
        // The generated line pages are landing pages for search traffic, not part
        // of the app: precaching all of them would push ~30 documents onto every
        // visitor for pages most of them never open.
        globIgnores: ['**/version.json', '**/bus_rental_hero*.png', '**/favicon.ico', 'linia/**'],
        cleanupOutdatedCaches: true,
        // Those pages are real files, so the SW must not answer a /linia/...
        // navigation with index.html — a returning visitor (and Googlebot on a
        // repeat crawl) would get the app shell instead of the page.
        navigateFallbackDenylist: [/^\/linia\//],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB
        // Ensure version.json and sitemap are never cached
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/darycommerce\.com\/version\.json.*/i,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /\/version\.json/i,
            handler: 'NetworkOnly',
          },
          {
            // A line page is now a real navigation away from the app, so without
            // this a rider with no signal could no longer reach a timetable they
            // had already opened. Cached on first visit, refreshed in the
            // background — nothing is downloaded up front.
            urlPattern: /\/linia\/[^/]+\/?$/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'line-pages',
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Cache client photos from Firebase Storage so each photo, once viewed
            // online, is available instantly and offline on later scans.
            urlPattern: /^https:\/\/firebasestorage\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'client-photos',
              expiration: {
                maxEntries: 2000,
                maxAgeSeconds: 60 * 60 * 24 * 90, // 90 days
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
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
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    }),
    {
      // Writes the pages once the bundle is on disk. VitePWA globs dist after
      // this, which is why its globIgnores above has to exclude linia/.
      name: 'dary-line-pages',
      apply: 'build' as const,
      async closeBundle() {
        const { pages } = await generateLinePages({
          outDir: 'dist',
          routes: listedRoutes(),
          ROUTE_METADATA,
          SCHEDULES,
          cardPrice,
          routeSlug,
          holidays: HOLIDAYS_2026.map(h => h.date),
          disabledDiscountPct,
        })
        console.log(`
  ✓ генерирани страници на линии: ${pages}`)
      },
    },
  ],
  define: {
    'import.meta.resolve': '(undefined)',
  },
  build: {
    target: 'es2015',
    modulePreload: false,
  }
})
