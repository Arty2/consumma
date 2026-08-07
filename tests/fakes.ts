import type { BlobEntry, Blobs } from '../src/lib/server/store';

/**
 * The blob store, in memory.
 *
 * Everything the app does to storage goes through the `Blobs` interface, so
 * this is the whole of what has to stand in for Vercel — and it is the only
 * thing faked in any of the three suites that use it: `tests/sync.spec.ts`
 * drives the client against it, `tests/route.spec.ts` drives the real route
 * handlers, and `e2e/sync.e2e.ts` puts two real browsers in front of it.
 *
 * It lived in all three for a while. One copy drifting from the others would
 * have meant three suites agreeing with each other and none of them with the
 * app.
 */
export class FakeBlobs implements Blobs {
	files = new Map<string, { body: string; uploadedAt: Date }>();

	async get(pathname: string) {
		return this.files.get(pathname)?.body ?? null;
	}

	async put(pathname: string, body: string) {
		this.files.set(pathname, { body, uploadedAt: new Date() });
	}

	async list(prefix: string): Promise<BlobEntry[]> {
		return [...this.files.entries()]
			.filter(([path]) => path.startsWith(prefix))
			.map(([pathname, file]) => ({
				pathname,
				uploadedAt: file.uploadedAt,
				size: file.body.length
			}));
	}

	async del(pathname: string) {
		this.files.delete(pathname);
	}
}
