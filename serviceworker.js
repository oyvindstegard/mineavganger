/**********************************************************************************
 * Service worker for mine avganger.
 **********************************************************************************
 * Uses boilerplate code from:
 * https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers
 */

'use strict';

const V = '2';

const cacheName = 'V' + V;

const openCache = async () => {
    return await caches.open(cacheName);
};

const deleteCache = async (key) => {
    await caches.delete(key);
};

const deleteOldCaches = async () => {
    const cacheKeepList = [cacheName];
    const keyList = await caches.keys();
    const cachesToDelete = keyList.filter((key) => !cacheKeepList.includes(key));
    await Promise.all(cachesToDelete.map(deleteCache));
};

const putInCache = async (requestUrl, response) => {
    const cache = await openCache();
    await cache.put(requestUrl, response);
};

self.addEventListener('install', (e) => {
    self.skipWaiting();
    e.waitUntil(openCache());
});

self.addEventListener('activate', (e) => {
    e.waitUntil(deleteOldCaches());
});

const cacheFirst = async (requestUrl) => {
    const cache = await caches.open(cacheName);
    const responseFromCache = await cache.match(requestUrl);
    if (responseFromCache) {
        console.log('NEWHIT for URL: ' + requestUrl);
        return responseFromCache;
    }

    const responseFromNetwork = await fetch(requestUrl, {
        cache: 'reload'
    });
    putInCache(requestUrl, responseFromNetwork.clone());

    return responseFromNetwork;
};

self.addEventListener('fetch', async (ev) => {
    const request = ev.request;
    
    // Use cache for app-internal resources only, and
    // ensure app-internal resource URLs use cache busting version query param.
    if (request.method === 'GET' && request.url.startsWith(location.origin)) {
        const requestUrl = new URL(request.url);
        if (requestUrl.searchParams.get('_V') === null) {
            requestUrl.searchParams.set('_V', V);
        }
        ev.respondWith(cacheFirst(requestUrl.toString()));
    }
});

/* Local Variables: */
/* js2-additional-externs: ("self" "URL" "Request") */
/* End: */
