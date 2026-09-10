const CACHE_NAME = 'aword-v2'
const BASE_PATH = self.location.pathname.replace(/sw\.js$/, '')
const APP_SHELL = [
  BASE_PATH,
  `${BASE_PATH}index.html`,
  `${BASE_PATH}manifest.webmanifest`,
  `${BASE_PATH}icons/icon-192.png`,
  `${BASE_PATH}icons/icon-512.png`,
  `${BASE_PATH}icons/icon-maskable-512.png`,
]

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
    )),
  )
  self.clients.claim()
})

async function serveRangeRequest(request) {
  const cache = await caches.open(CACHE_NAME)
  let response = await cache.match(request.url)

  if (!response) {
    response = await fetch(request.url, { credentials: request.credentials })
    if (response.status !== 200) return response
    await cache.put(request.url, response.clone())
  }

  const range = request.headers.get('range')
  const match = range && range.match(/^bytes=(\d*)-(\d*)$/)
  if (!match) return response

  const data = await response.arrayBuffer()
  const size = data.byteLength
  let start
  let end

  if (match[1] === '') {
    const suffixLength = Number(match[2])
    start = Math.max(0, size - suffixLength)
    end = size - 1
  } else {
    start = Number(match[1])
    end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= size || end < start) {
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${size}` },
    })
  }

  const headers = new Headers(response.headers)
  headers.set('Accept-Ranges', 'bytes')
  headers.set('Content-Range', `bytes ${start}-${end}/${size}`)
  headers.set('Content-Length', String(end - start + 1))

  return new Response(data.slice(start, end + 1), {
    status: 206,
    statusText: 'Partial Content',
    headers,
  })
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return

  if (request.headers.has('range')) {
    event.respondWith(serveRangeRequest(request))
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request)
        if (response.status === 200) {
          const cache = await caches.open(CACHE_NAME)
          await cache.put(`${BASE_PATH}index.html`, response.clone())
        }
        return response
      } catch {
        return caches.match(`${BASE_PATH}index.html`)
      }
    })())
    return
  }

  event.respondWith((async () => {
    const cached = await caches.match(request)
    if (cached) return cached
    const response = await fetch(request)
    if (response.status === 200) {
      const cache = await caches.open(CACHE_NAME)
      await cache.put(request, response.clone())
    }
    return response
  })())
})
