import { del, head, list, put } from '@vercel/blob';
import type { BlobEntry, Blobs } from './store';

/**
 * The real blob client. Everything the app depends on sits behind the `Blobs`
 * interface, so the routes are tested against an in-memory double and this
 * file stays thin enough to read in one go.
 *
 * `addRandomSuffix: false` because the path has to be derivable from the room
 * id; `allowOverwrite: true` because a list is one file rewritten in place;
 * `cacheControlMaxAge: 0` because a stale ciphertext served from a CDN would
 * look exactly like someone else's edit vanishing.
 */
export const vercelBlobs: Blobs = {
	async get(pathname) {
		let downloadUrl: string;

		try {
			// head() is what turns a pathname into a URL to fetch. It costs one
			// extra blob operation per read; at manual-sync volumes that is a
			// handful a day, and the alternative is caching the store's base URL
			// in module scope for a saving nobody would notice.
			({ downloadUrl } = await head(pathname));
		} catch {
			// The SDK throws BlobNotFoundError rather than returning null.
			return null;
		}

		const response = await fetch(downloadUrl, { cache: 'no-store' });
		return response.ok ? await response.text() : null;
	},

	async put(pathname, body) {
		await put(pathname, body, {
			access: 'public',
			addRandomSuffix: false,
			allowOverwrite: true,
			contentType: 'application/json',
			cacheControlMaxAge: 0
		});
	},

	async list(prefix) {
		const out: BlobEntry[] = [];
		let cursor: string | undefined;

		do {
			const page = await list({ prefix, cursor });
			for (const blob of page.blobs) {
				out.push({
					pathname: blob.pathname,
					uploadedAt: new Date(blob.uploadedAt),
					size: blob.size
				});
			}
			cursor = page.hasMore ? page.cursor : undefined;
		} while (cursor);

		return out;
	},

	async del(pathname) {
		await del(pathname);
	}
};
