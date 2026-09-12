import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

// COOP/COEP headers make the page cross-origin isolated so the multithreaded
// solver build can use SharedArrayBuffer. vercel.json sets the same headers in prod.
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

// BASE_PATH=/GTO/ for GitHub Pages project sites; '/' for Vercel and local dev.
const base = process.env.BASE_PATH ?? '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // custom service worker: precaching + COOP/COEP header injection (needed on hosts that
      // cannot set headers, e.g. GitHub Pages) so the multithreaded solver can run
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,svg,wasm}'],
      },
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'GTO Trainer',
        short_name: 'GTO Trainer',
        description: 'Log live poker hands and grade every decision against GTO.',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
    }),
  ],
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
  worker: { format: 'es' },
  build: { target: 'es2022' },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
