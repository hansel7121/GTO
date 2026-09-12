/**
 * Hosts like GitHub Pages cannot send the Cross-Origin-Opener-Policy / Cross-Origin-Embedder-Policy
 * headers that SharedArrayBuffer (the multithreaded solver) requires. Our service worker adds them
 * to every same-origin response, but the page that registered the worker is not yet controlled by
 * it, so we reload once after the worker takes control (same technique as coi-serviceworker).
 */
export function ensureCrossOriginIsolation() {
  if (typeof window === 'undefined' || window.crossOriginIsolated) return
  if (!('serviceWorker' in navigator)) return
  const key = 'coi-reloaded'
  if (sessionStorage.getItem(key)) return
  const reload = () => {
    if (window.crossOriginIsolated || sessionStorage.getItem(key)) return
    sessionStorage.setItem(key, '1')
    window.location.reload()
  }
  navigator.serviceWorker.addEventListener('controllerchange', reload)
  navigator.serviceWorker.ready.then(() => {
    if (navigator.serviceWorker.controller) reload()
  })
}
