import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * The one file that talks to Vercel, and the one that had no test — which is
 * how it kept a bug that made a broken deployment look like a working one.
 *
 * `get()` caught every error and returned null, so a store that was not
 * connected, or a token that was missing, answered every read with "no list
 * here". A `curl` against the API looked perfectly healthy: 404, the right
 * headers, served by a real function. Only writes failed, and the client
 * reported that as being offline.
 *
 * The same disguise covered a store set to private, which refuses a public
 * write and cannot be read through a public URL at all.
 *
 * The SDK is mocked because the alternative is a network and a token; what is
 * under test is which failures mean "nothing written yet" and which mean
 * something is wrong.
 */

const get = vi.fn();
const put = vi.fn();
const del = vi.fn();
const list = vi.fn();

class BlobStoreNotFoundError extends Error {}

vi.mock('@vercel/blob', () => ({
	get: (...args: unknown[]) => get(...args),
	put: (...args: unknown[]) => put(...args),
	del: (...args: unknown[]) => del(...args),
	list: (...args: unknown[]) => list(...args)
}));

const { vercelBlobs } = await import('../src/lib/server/blobs');

beforeEach(() => {
	vi.clearAllMocks();
	vi.unstubAllGlobals();
});

describe('the blob backend', () => {
	it('reports a blob that is not there as nothing, which is a list nobody wrote', async () => {
		get.mockResolvedValueOnce(null);

		await expect(vercelBlobs.get('rooms/abc.json')).resolves.toBeNull();
	});

	it('refuses to pass off a disconnected store as an empty list', async () => {
		get.mockRejectedValueOnce(new BlobStoreNotFoundError('no store'));

		await expect(vercelBlobs.get('rooms/abc.json')).rejects.toThrow('no store');
	});

	it('refuses to pass off a missing token as an empty list', async () => {
		// What the SDK throws with no BLOB_READ_WRITE_TOKEN set.
		get.mockRejectedValueOnce(new Error('No token found'));

		await expect(vercelBlobs.get('rooms/abc.json')).rejects.toThrow('No token found');
	});

	it('reads privately, and never from a cache', async () => {
		get.mockResolvedValueOnce({ stream: new Response('{"v":1}').body });

		await expect(vercelBlobs.get('rooms/abc.json')).resolves.toBe('{"v":1}');

		// A stale ciphertext from a CDN looks exactly like someone's edit vanishing.
		expect(get).toHaveBeenCalledWith('rooms/abc.json', { access: 'private', useCache: false });
	});

	it('writes one file in place, uncacheable, at the path it was given', async () => {
		await vercelBlobs.put('rooms/abc.json', '{"v":2}');

		expect(put).toHaveBeenCalledWith('rooms/abc.json', '{"v":2}', {
			// A public write is refused outright by a private store, and the
			// ciphertext has no business being fetchable from a guessable path.
			access: 'private',
			// The path has to stay derivable from the room id.
			addRandomSuffix: false,
			// A list is one file, rewritten.
			allowOverwrite: true,
			contentType: 'application/json',
			cacheControlMaxAge: 0
		});
	});

	it('walks every page when listing, so the sweep cannot miss a list', async () => {
		list
			.mockResolvedValueOnce({
				blobs: [{ pathname: 'a', uploadedAt: '2026-01-01T00:00:00Z', size: 1 }],
				hasMore: true,
				cursor: 'next'
			})
			.mockResolvedValueOnce({
				blobs: [{ pathname: 'b', uploadedAt: '2026-01-02T00:00:00Z', size: 2 }],
				hasMore: false
			});

		const entries = await vercelBlobs.list('rooms/');

		expect(entries.map((e) => e.pathname)).toStrictEqual(['a', 'b']);
		expect(entries[0].uploadedAt).toBeInstanceOf(Date);
		expect(list).toHaveBeenLastCalledWith({ prefix: 'rooms/', cursor: 'next' });
	});
});
