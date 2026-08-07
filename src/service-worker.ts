/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />

import { build, files, prerendered, version } from '$service-worker';

/**
 * A shared list is something you open standing in a shop with one bar of
 * signal, so opening offline is not a nicety.
 *
 * The document itself is not cached here — it lives in localStorage and the
 * app reads it on start exactly as it does online. This only has to make the
 * shell available.
 */

const worker = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `consumma-${version}`;
/*
 * `prerendered` is the part that is easy to forget: `build` is the hashed
 * assets and `files` is static/, but the page itself is a prerendered route.
 * Without it the app opens offline to a network error rather than to the list.
 */
const PRECACHE = [...build, ...files, ...prerendered];

worker.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll(PRECACHE))
			.then(() => worker.skipWaiting())
	);
});

worker.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
			)
			.then(() => worker.clients.claim())
	);
});

worker.addEventListener('fetch', (event) => {
	const request = event.request;
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	if (url.origin !== location.origin) return;

	/*
	 * Network-only for the API, and never cached. A stale ciphertext served
	 * from a cache would look exactly like someone else's edit vanishing —
	 * which is the one failure this app must not invent.
	 */
	if (url.pathname.startsWith('/api/')) return;

	event.respondWith(handle(request, url));
});

async function handle(request: Request, url: URL): Promise<Response> {
	const cache = await caches.open(CACHE);

	// Precached assets are content-hashed and immutable, so cache-first is both
	// correct and the fastest thing available.
	if (PRECACHE.includes(url.pathname)) {
		const hit = await cache.match(url.pathname);
		if (hit) return hit;
	}

	try {
		const response = await fetch(request);
		if (response.ok && request.mode !== 'navigate') {
			cache.put(request, response.clone());
		}
		return response;
	} catch {
		// The shell, so the app opens and reads its list out of localStorage.
		const shell = (await cache.match(request)) ?? (await cache.match('/'));
		if (shell) return shell;

		throw new Error('offline and nothing cached');
	}
}
