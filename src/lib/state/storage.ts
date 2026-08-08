import { browser } from '$app/environment';

/**
 * Everything the app keeps on the device.
 *
 * The code lives here and nowhere else — never sessionStorage, never a cookie,
 * never a URL (§13, §14). Losing it loses the list, which is why EXPORT exists
 * and why the DELETE confirm shows the code one last time.
 */
export const KEYS = {
	doc: 'consumma:doc',
	clientId: 'consumma:clientId',
	lastT: 'consumma:lastT',
	collapsed: 'consumma:collapsed',
	/*
	 * Written only once someone has picked one, and removed again when they go
	 * back to following the phone. static/theme.js reads this key by name
	 * before the app has loaded — see the note there, and the test that holds
	 * the two spellings together.
	 */
	theme: 'consumma:theme',
	code: 'consumma:code',
	version: 'consumma:version',
	synced: 'consumma:synced'
} as const;

/**
 * Prerendering runs in Node, and a browser with storage disabled throws on
 * access rather than returning null. Every read and write goes through here so
 * neither case can take the app down.
 */
export function read(key: string): string | null {
	if (!browser) return null;
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

export function write(key: string, value: string): void {
	if (!browser) return;
	try {
		localStorage.setItem(key, value);
	} catch {
		// Quota or a blocked storage partition. The app stays usable for this
		// session; there is nothing useful to say about it on the sheet.
	}
}

export function remove(key: string): void {
	if (!browser) return;
	try {
		localStorage.removeItem(key);
	} catch {
		// As above.
	}
}

export function readJson<T>(key: string, fallback: T): T {
	const raw = read(key);
	if (raw === null) return fallback;

	try {
		return JSON.parse(raw) as T;
	} catch {
		return fallback;
	}
}

export function writeJson(key: string, value: unknown): void {
	write(key, JSON.stringify(value));
}

/**
 * Asks the browser to stop evicting us. Home-screen installs are usually
 * granted it; browser tabs often are not. Called once, after a list exists.
 */
export async function persist(): Promise<boolean> {
	if (!browser || !navigator.storage?.persist) return false;
	try {
		return await navigator.storage.persist();
	} catch {
		return false;
	}
}
