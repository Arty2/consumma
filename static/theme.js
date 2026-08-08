/*
 * Resolves the theme before the first paint, so a sheet that is going to be
 * black is never white first. There are only two colours here, so that flash
 * is the whole screen — and it lands at exactly the moment the app opens.
 *
 * A file rather than an inline script because the CSP is `script-src 'self'`.
 * SvelteKit hashes the scripts it injects itself and knows nothing about one
 * written into app.html, so an inline snippet would be refused and the app
 * would open light whatever anyone had chosen. Same origin needs no hash, and
 * `files` in the service worker precaches static/, so this still runs offline.
 *
 * The key below is `KEYS.theme` in src/lib/state/storage.ts, spelled a second
 * time because nothing can be imported from here. tests/theme.spec.ts reads
 * this file back off disk and fails if the two ever stop agreeing.
 */
(function () {
	var choice = null;

	try {
		choice = localStorage.getItem('consumma:theme');
	} catch {
		// Storage blocked or partitioned. The phone's own preference still stands.
	}

	var dark =
		choice === 'dark' ||
		(choice !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);

	// The resolved colour, never `system`: the stylesheet should not have to
	// work out a preference it would then disagree with this script about.
	document.documentElement.dataset.theme = dark ? 'dark' : 'light';

	var meta = document.querySelector('meta[name="theme-color"]');
	if (meta) meta.setAttribute('content', dark ? '#000000' : '#ffffff');
})();
