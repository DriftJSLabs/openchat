// Cache versioning - increment this to force cache update
const CACHE_VERSION = 'v2';
const CACHE_NAME = `openchat-${CACHE_VERSION}`;

// Cache TTL in milliseconds
const CACHE_TTL = {
  images: 7 * 24 * 60 * 60 * 1000, // 7 days
  fonts: 30 * 24 * 60 * 60 * 1000, // 30 days
  static: 24 * 60 * 60 * 1000, // 1 day
  api: 0, // No caching for API
  html: 0, // No caching for HTML
};

// Resources to precache on install
const STATIC_RESOURCES = [
  '/favicon.ico',
  '/favicon.svg',
  '/icon-192x192.png',
  '/manifest.json',
];

// Helper function to determine resource type
function getResourceType(url) {
  const pathname = new URL(url).pathname;
  // Always treat Next.js build assets as network-first to avoid stale UI.
  if (pathname.startsWith('/_next/')) {
    return 'next';
  }
  
  // API routes - never cache
  if (pathname.startsWith('/api/') || pathname.includes('convex')) {
    return 'api';
  }
  
  // HTML documents - network first
  if (pathname === '/' || pathname.endsWith('.html') || 
      pathname.startsWith('/chat/') || pathname.startsWith('/sign-') ||
      !pathname.includes('.')) {
    return 'html';
  }
  
  // Images
  if (/\.(jpg|jpeg|png|gif|webp|svg|ico)$/i.test(pathname)) {
    return 'images';
  }
  
  // Fonts
  if (/\.(woff|woff2|ttf|otf|eot)$/i.test(pathname)) {
    return 'fonts';
  }
  
  // Other static assets (CSS, JS bundles)
  if (/\.(css|js)$/i.test(pathname)) {
    return 'static';
  }
  
  return 'unknown';
}

// Check if cached response is expired
function isCacheExpired(response, ttl) {
  if (!response || ttl === 0) return true;
  
  const fetchDate = response.headers.get('sw-fetch-time');
  if (!fetchDate) return true;
  
  const age = Date.now() - parseInt(fetchDate);
  return age > ttl;
}

// Clone response and add timestamp header
function addTimestamp(response) {
  const headers = new Headers(response.headers);
  headers.set('sw-fetch-time', Date.now().toString());
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: headers
  });
}

// Network-first strategy (for HTML and API)
async function networkFirst(request, cacheName) {
  try {
    const networkResponse = await fetch(request);
    
    // Only cache successful responses
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      // Don't cache API responses
      const resourceType = getResourceType(request.url);
      if (resourceType !== 'api') {
        await cache.put(request, addTimestamp(networkResponse.clone()));
      }
    }
    
    return networkResponse;
  } catch (error) {
    // Network failed, try cache as fallback
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Return offline page if available
    if (request.mode === 'navigate') {
      const cache = await caches.open(cacheName);
      return cache.match('/offline.html') || new Response('Offline', {
        status: 503,
        statusText: 'Service Unavailable'
      });
    }
    
    throw error;
  }
}

// Cache-first strategy with TTL (for static assets)
async function cacheFirst(request, cacheName, ttl) {
  const cachedResponse = await caches.match(request);
  
  // Return cached response if not expired
  if (cachedResponse && !isCacheExpired(cachedResponse, ttl)) {
    return cachedResponse;
  }
  
  // Fetch from network
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      await cache.put(request, addTimestamp(networkResponse.clone()));
    }
    
    return networkResponse;
  } catch (error) {
    // Return expired cache if network fails
    if (cachedResponse) {
      return cachedResponse;
    }
    throw error;
  }
}

// Install event - precache static resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_RESOURCES))
      .then(() => self.skipWaiting()) // Activate immediately
  );
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(cacheName => cacheName.startsWith('openchat-') && cacheName !== CACHE_NAME)
            .map(cacheName => caches.delete(cacheName))
        );
      })
      .then(() => self.clients.claim()) // Take control immediately
  );
});

// Fetch event - handle requests with appropriate strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const resourceType = getResourceType(request.url);
  
  // Skip caching for non-GET requests
  if (request.method !== 'GET') {
    event.respondWith(fetch(request));
    return;
  }
  
  // Skip caching for external resources
  if (!request.url.startsWith(self.location.origin)) {
    event.respondWith(fetch(request));
    return;
  }
  
  // Apply appropriate caching strategy
  switch (resourceType) {
    case 'api':
    case 'html':
      // Network-first for dynamic content
      event.respondWith(networkFirst(request, CACHE_NAME));
      break;
    case 'next':
      // Always fetch fresh Next.js build assets to prevent stale bundles
      event.respondWith(networkFirst(request, CACHE_NAME));
      break;
      
    case 'images':
      // Cache-first with TTL for images
      event.respondWith(cacheFirst(request, CACHE_NAME, CACHE_TTL.images));
      break;
      
    case 'fonts':
      // Cache-first with TTL for fonts
      event.respondWith(cacheFirst(request, CACHE_NAME, CACHE_TTL.fonts));
      break;
      
    case 'static':
      // Cache-first with TTL for static assets
      event.respondWith(cacheFirst(request, CACHE_NAME, CACHE_TTL.static));
      break;
      
    default:
      // Network-first for unknown resources
      event.respondWith(networkFirst(request, CACHE_NAME));
  }
});

// Message event - allow manual cache updates
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
  
  if (event.data === 'clearCache') {
    event.waitUntil(
      caches.keys()
        .then(cacheNames => Promise.all(
          cacheNames.map(cacheName => caches.delete(cacheName))
        ))
    );
  }
});
