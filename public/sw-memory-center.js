/* public/sw-memory-center.js
 * Memory Center Service Worker — offline-first + Background Sync.
 * Queues POST /api/memory/events when offline and flushes when connectivity returns.
 */

const DB_NAME = 'lattice-os-memory-events';
const STORE = 'memory-events';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function persistEvent(event) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).add(event);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function flushQueue() {
  const db = await openDb();
  const events = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });

  if (!events.length) return;

  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  const settled = await Promise.allSettled(
    events.map((event) =>
      fetch('/api/memory/events', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(event),
      }).catch(() => null)
    )
  );

  const failed = settled.filter((result) => result.status === 'rejected' || !result.value || !result.value.ok);
  if (failed.length) {
    await persistEvent(failed.map((_, idx) => events[idx]).filter(Boolean));
  }
}

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'FLUSH_MEMORY_EVENTS') {
    void flushQueue();
  }
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'memory-events-sync') {
    event.waitUntil(flushQueue());
  }
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'POST' || !event.request.url.includes('/api/memory/events')) {
    return;
  }

  event.respondWith(
    (async () => {
      try {
        const response = await fetch(event.request.clone());
        if (response.ok) return response;
        throw new Error(`network error: ${response.status}`);
      } catch (error) {
        const body = await event.request.clone().json().catch(() => null);
        if (body) await persistEvent(body);
        return new Response(JSON.stringify({ queued: true }), {
          status: 202,
          headers: { 'content-type': 'application/json' },
        });
      }
    })()
  );
});
