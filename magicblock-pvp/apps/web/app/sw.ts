// Service Worker for SOL Duel PWA
// Optimized for gaming performance and real-time updates

const CACHE_NAME = 'solduel-v1';
const RUNTIME_CACHE = 'solduel-runtime';

// Cache strategy for different resource types
const CACHE_STRATEGIES = {
  // Critical app shell - cache first
  appShell: [
    '/',
    '/lobby',
    '/game', 
    '/profile',
    '/leaderboard',
    '/manifest.json'
  ],
  
  // Static assets - cache first with fallback
  static: [
    '/globals.css',
    '/favicon.ico'
  ],

  // API calls - network first with cache fallback
  api: [
    '/api/profile',
    '/api/leaderboard', 
    '/api/game'
  ],

  // Real-time data - network only (no cache)
  realtime: [
    '/api/live',
    '/socket.io'
  ]
};

// Install event - cache critical resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('🚀 Service Worker: Caching app shell');
        return cache.addAll([
          ...CACHE_STRATEGIES.appShell,
          ...CACHE_STRATEGIES.static
        ]);
      })
      .then(() => {
        // Skip waiting to activate immediately
        self.skipWaiting();
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
              console.log('🗑️ Service Worker: Deleting old cache', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        // Take control of all pages
        return self.clients.claim();
      })
  );
});

// Fetch event - implement cache strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-HTTP requests
  if (!request.url.startsWith('http')) {
    return;
  }

  // Handle WebSocket connections (pass through)
  if (url.protocol === 'ws:' || url.protocol === 'wss:') {
    return;
  }

  // Real-time data - always fetch from network
  if (CACHE_STRATEGIES.realtime.some(pattern => url.pathname.includes(pattern))) {
    event.respondWith(fetch(request));
    return;
  }

  // App shell and static assets - cache first
  if (CACHE_STRATEGIES.appShell.includes(url.pathname) || 
      CACHE_STRATEGIES.static.some(pattern => url.pathname.includes(pattern))) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // API calls - network first with cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstWithCache(request));
    return;
  }

  // Default strategy for other requests - stale while revalidate
  event.respondWith(staleWhileRevalidate(request));
});

// Cache first strategy - for app shell and static assets
async function cacheFirst(request) {
  try {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    const networkResponse = await fetch(request);
    if (networkResponse.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request.clone(), networkResponse.clone());
    }
    return networkResponse;

  } catch (error) {
    console.error('Cache first strategy failed:', error);
    
    // Return offline fallback for navigation requests
    if (request.mode === 'navigate') {
      return caches.match('/');
    }
    
    throw error;
  }
}

// Network first with cache fallback - for API calls
async function networkFirstWithCache(request) {
  try {
    const networkResponse = await fetch(request);
    
    // Cache successful responses
    if (networkResponse.status === 200) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request.clone(), networkResponse.clone());
    }
    
    return networkResponse;

  } catch (error) {
    console.log('Network failed, checking cache:', error);
    
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    throw error;
  }
}

// Stale while revalidate - for other resources
async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cachedResponse = await cache.match(request);

  // Start fetch in background
  const fetchPromise = fetch(request).then((networkResponse) => {
    if (networkResponse.status === 200) {
      cache.put(request.clone(), networkResponse.clone());
    }
    return networkResponse;
  });

  // Return cached version immediately if available
  return cachedResponse || fetchPromise;
}

// Handle background sync for game actions
self.addEventListener('sync', (event) => {
  if (event.tag === 'game-action-sync') {
    event.waitUntil(syncGameActions());
  }
});

// Sync queued game actions when back online
async function syncGameActions() {
  try {
    // Get queued actions from IndexedDB
    const queuedActions = await getQueuedActions();
    
    for (const action of queuedActions) {
      try {
        const response = await fetch('/api/game/action', {
          method: 'POST',
          body: JSON.stringify(action),
          headers: {
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          await removeQueuedAction(action.id);
        }
      } catch (error) {
        console.error('Failed to sync action:', error);
      }
    }
  } catch (error) {
    console.error('Background sync failed:', error);
  }
}

// Push notifications for game events
self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const { title, body, icon, badge, tag, data: notificationData } = data;

    const options = {
      body,
      icon: icon || '/icons/icon-192x192.png',
      badge: badge || '/icons/badge-72x72.png',
      tag: tag || 'default',
      data: notificationData,
      requireInteraction: true,
      actions: [
        {
          action: 'view',
          title: 'View Game',
          icon: '/icons/action-view.png'
        },
        {
          action: 'dismiss',
          title: 'Dismiss'
        }
      ]
    };

    event.waitUntil(
      self.registration.showNotification(title, options)
    );

  } catch (error) {
    console.error('Push notification error:', error);
  }
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  // Focus or open the app
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      // Check if app is already open
      for (const client of clients) {
        if (client.url.includes('/game') && 'focus' in client) {
          return client.focus();
        }
      }

      // Open new window/tab
      const url = event.notification.data?.url || '/lobby';
      return self.clients.openWindow(url);
    })
  );
});

// Periodic background sync for leaderboard updates
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'leaderboard-update') {
    event.waitUntil(updateLeaderboardCache());
  }
});

async function updateLeaderboardCache() {
  try {
    const response = await fetch('/api/leaderboard');
    if (response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put('/api/leaderboard', response.clone());
    }
  } catch (error) {
    console.error('Periodic sync failed:', error);
  }
}

// Utility functions for IndexedDB operations
async function getQueuedActions() {
  // Implementation would use IndexedDB to store/retrieve queued actions
  return [];
}

async function removeQueuedAction(id) {
  // Implementation would remove action from IndexedDB
}

// Error handling and logging
self.addEventListener('error', (event) => {
  console.error('Service Worker error:', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
  console.error('Service Worker unhandled rejection:', event.reason);
});

console.log('🎮 SOL Duel Service Worker loaded');