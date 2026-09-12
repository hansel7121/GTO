/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, matchPrecache, precacheAndRoute } from 'workbox-precaching'

declare let self: ServiceWorkerGlobalScope

self.skipWaiting()
clientsClaim()

// Serve same-origin requests (from the precache when possible) with the COOP/COEP headers so the
// page becomes cross-origin isolated even on hosts that cannot set response headers.
// Registered before precacheAndRoute so it runs first.
self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (req.cache === 'only-if-cached' && req.mode !== 'same-origin') return
  event.respondWith(
    (async () => {
      let res: Response | undefined
      if (req.mode === 'navigate') res = await matchPrecache('index.html')
      if (!res) res = await matchPrecache(req)
      if (!res) {
        try {
          res = await fetch(req)
        } catch (e) {
          if (req.mode === 'navigate') res = await matchPrecache('index.html')
          if (!res) throw e
        }
      }
      if (res.status === 0 || res.type === 'opaque') return res
      const headers = new Headers(res.headers)
      headers.set('Cross-Origin-Embedder-Policy', 'require-corp')
      headers.set('Cross-Origin-Opener-Policy', 'same-origin')
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
    })(),
  )
})

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)
