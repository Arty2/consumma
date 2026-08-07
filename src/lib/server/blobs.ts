import { del, get, list, put } from '@vercel/blob';
import type { BlobEntry, Blobs } from './store';

/**
 * The real blob client. Everything the app depends on sits behind the `Blobs`
 * interface, so the routes are tested against an in-memory double and this
 * file stays thin enough to read in one go.
 *
 * Everything here is `access: 'private'`. The bytes are ciphertext either way,
 * but the blob path is derived from the room id and so is guessable by anyone
 * holding it — public access would leave that ciphertext one request from the
 * open internet for no benefit. Nothing but the function ever needs to read it,
 * which is what the README always said.
 *
 * A store set to private also refuses a public write, and the failure is
 * opaque: the PUT is a 500 while reads answer an ordinary-looking 404.
 *
 * `addRandomSuffix: false` because the path has to be derivable from the room
 * id; `allowOverwrite: true` because a list is one file rewritten in place;
 * `cacheControlMaxAge: 0` and `useCache: false` because a stale ciphertext
 * served from a CDN would look exactly like someone else's edit vanishing.
 */
export const vercelBlobs: Blobs = {
	async get(pathname) {
		/*
		 * One call, and it answers null rather than throwing when there is no such
		 * blob — the only "failure" that means a list nobody has written yet.
		 * Everything else throws, and is meant to: a store that is not connected,
		 * or a token that is missing, must not be dressed up as an empty list.
		 *
		 * This replaced head() plus a fetch of the public URL, which cost two blob
		 * operations per read and could not work against a private store at all.
		 */
		const result = await get(pathname, { access: 'private', useCache: false });
		if (!result) return null;

		return await new Response(result.stream).text();
	},

	async put(pathname, body) {
		await put(pathname, body, {
			access: 'private',
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
