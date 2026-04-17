import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { ViteImageOptimizer } from 'vite-plugin-image-optimizer'
import legacy from '@vitejs/plugin-legacy'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    legacy({
      targets: ['defaults', 'not IE 11', 'Android >= 9'],
    }),
    ViteImageOptimizer({
      test: /\.(jpe?g|png|gif|tiff|webp|svg|avif)$/i,
      png: { quality: 80 },
      webp: { quality: 80 },
      avif: { quality: 60 },
    }),
  ],
  define: {
    // 🛡️ Fix for myPOS Ultra WebView (Android 11)
    // Replaces the modern import.meta.resolve syntax with a safe fallback during build
    'import.meta.resolve': '(undefined)'
  },
  build: {
    target: 'chrome58',
    modulePreload: {
      polyfill: false
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('firebase')) return 'firebase-vendor';
          if (id.includes('react')) return 'react-vendor';
          if (id.includes('lucide')) return 'ui-vendor';
        }
      }
    }
  },
  base: '/',
})
