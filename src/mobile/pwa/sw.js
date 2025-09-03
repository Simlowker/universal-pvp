const CACHE_NAME = 'universal-pvp-mobile-v1.0.0';
const DYNAMIC_CACHE = 'universal-pvp-dynamic-v1.0.0';
const STATIC_CACHE = 'universal-pvp-static-v1.0.0';

// Critical app shell resources
const APP_SHELL = [
  '/',
  '/manifest.json',
  '/offline',
  '/static/css/app.css',
  '/static/js/app.js',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
];

// Game assets that should be cached
const GAME_ASSETS = [
  '/sounds/click.mp3',
  '/sounds/attack.mp3',
  '/sounds/victory.mp3',
  '/sounds/defeat.mp3',
  '/images/characters/',
  '/images/abilities/',
];

// Install event - cache app shell
self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE).then((cache) => {
        return cache.addAll(APP_SHELL);
      }),
      self.skipWaiting()
    ])
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');
  
  event.waitUntil(
    Promise.all([
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheName) => {
              return cacheName.startsWith('universal-pvp-') && 
                     cacheName !== CACHE_NAME &&
                     cacheName !== DYNAMIC_CACHE &&
                     cacheName !== STATIC_CACHE;
            })
            .map((cacheName) => caches.delete(cacheName))
        );
      }),
      self.clients.claim()
    ])
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip cross-origin requests
  if (!url.origin.includes(self.location.origin)) {
    return;
  }

  // Handle API requests with network-first strategy
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstStrategy(request));
    return;
  }

  // Handle game assets with cache-first strategy
  if (isGameAsset(url.pathname)) {
    event.respondWith(cacheFirstStrategy(request));
    return;
  }

  // Handle navigation requests with app shell
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .catch(() => {
          return caches.match('/offline');
        })
    );
    return;
  }

  // Default strategy for other requests
  event.respondWith(staleWhileRevalidate(request));
});

// Network-first strategy for API calls
async function networkFirstStrategy(request) {
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Return offline response for API failures
    return new Response(
      JSON.stringify({ 
        error: 'Offline', 
        message: 'No network connection available',
        cached: false 
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

// Cache-first strategy for game assets
async function cacheFirstStrategy(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    // Return placeholder for failed asset requests
    if (request.url.includes('/images/')) {
      return new Response(
        '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" fill="#2d2d30"/><text x="50" y="50" text-anchor="middle" fill="#9ca3af" font-size="12">Image</text></svg>',
        { headers: { 'Content-Type': 'image/svg+xml' }}
      );
    }
    throw error;
  }
}

// Stale-while-revalidate strategy
async function staleWhileRevalidate(request) {
  const cache = await caches.open(DYNAMIC_CACHE);
  const cachedResponse = await cache.match(request);

  const networkResponsePromise = fetch(request).then((response) => {
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  });

  return cachedResponse || networkResponsePromise;
}

// Helper function to identify game assets
function isGameAsset(pathname) {
  return GAME_ASSETS.some(asset => pathname.startsWith(asset));
}

// Background sync for game actions
self.addEventListener('sync', (event) => {
  console.log('Background sync triggered:', event.tag);
  
  if (event.tag === 'game-action-sync') {
    event.waitUntil(syncGameActions());
  }
  
  if (event.tag === 'wallet-sync') {
    event.waitUntil(syncWalletData());
  }
});

// Sync queued game actions when back online
async function syncGameActions() {
  try {
    const db = await openGameDB();
    const actions = await getQueuedActions(db);
    
    for (const action of actions) {
      try {
        const response = await fetch('/api/game/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(action.data)
        });
        
        if (response.ok) {
          await removeQueuedAction(db, action.id);
        }
      } catch (error) {
        console.error('Failed to sync game action:', error);
      }
    }
  } catch (error) {
    console.error('Game action sync failed:', error);
  }
}

// Sync wallet data when back online
async function syncWalletData() {
  try {
    const response = await fetch('/api/wallet/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (response.ok) {
      const clients = await self.clients.matchAll();
      clients.forEach(client => {
        client.postMessage({
          type: 'WALLET_SYNCED',
          data: { success: true }
        });
      });
    }
  } catch (error) {
    console.error('Wallet sync failed:', error);
  }
}

// Push notification handler for tournament updates
self.addEventListener('push', (event) => {
  console.log('Push notification received');
  
  if (!event.data) {
    return;
  }

  const data = event.data.json();
  const options = {
    body: data.body || 'New game update available!',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    tag: data.tag || 'game-update',
    data: data.url || '/',
    actions: [
      {
        action: 'open',
        title: 'Open Game',
        icon: '/icons/action-open.png'
      },
      {
        action: 'dismiss',
        title: 'Dismiss',
        icon: '/icons/action-dismiss.png'
      }
    ],
    vibrate: [200, 100, 200],
    requireInteraction: data.urgent || false,
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Universal PVP', options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  const urlToOpen = event.notification.data || event.action === 'open' ? '/' : '/';
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      // Check if the app is already open
      for (const client of clients) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      
      // Open new window if app is not open
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
    })
  );
});

// IndexedDB helpers for offline game state
function openGameDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('UniversalPVPGameDB', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      if (!db.objectStoreNames.contains('gameActions')) {
        const store = db.createObjectStore('gameActions', { 
          keyPath: 'id', 
          autoIncrement: true 
        });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
      
      if (!db.objectStoreNames.contains('gameState')) {
        db.createObjectStore('gameState', { keyPath: 'key' });
      }
    };
  });
}

function getQueuedActions(db) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['gameActions'], 'readonly');
    const store = transaction.objectStore('gameActions');
    const request = store.getAll();
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function removeQueuedAction(db, actionId) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['gameActions'], 'readwrite');
    const store = transaction.objectStore('gameActions');
    const request = store.delete(actionId);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}