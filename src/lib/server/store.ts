/**
 * The only module in the app that talks to blob storage.
 *
 * The browser never reaches the blob host: reads and writes both go to /api on
 * our own origin and the function fetches server-side. That costs an
 * invocation per sync and buys three things worth more — a CSP with
 * `connect-src 'self'` and nothing else, no CORS surface at all, and a store
 * that can stay private.
 *
 * Nothing here imports from src/lib/crypto, and it never could usefully: what
 * arrives is ciphertext and a room id, and that is all the server is ever in a
 * position to see.
 */

/**
 * Validated before it touches a blob path, in every handler, always.
 *
 * This is the path-traversal defence: the id is interpolated into
 * `rooms/${roomId}.json`, so a roomId of `../` would write outside the
 * namespace. Deliberately duplicated rather than imported from
 * src/lib/crypto/derive.ts — server code must not depend on that module, and
 * scripts/gates.sh fails the build if it does.
 */
export const ROOM_ID_PATTERN = /^[0-9a-f]{32}$/;

/** 128 KB. Anything larger is refused with 413 rather than stored. */
export const MAX_BLOB_BYTES = 128 * 1024;

/** Six months since the last write. Editing keeps a list alive; reading does not. */
export const EXPIRY_MS = 182 * 24 * 60 * 60 * 1000;

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

export type StoredRoom = { v: number; blob: string; at: number };

export type BlobEntry = { pathname: string; uploadedAt: Date; size: number };

/**
 * The slice of blob storage this app needs, so the routes can be tested
 * against an in-memory double rather than the network.
 */
export interface Blobs {
	get(pathname: string): Promise<string | null>;
	put(pathname: string, body: string): Promise<void>;
	list(prefix: string): Promise<BlobEntry[]>;
	del(pathname: string): Promise<void>;
}

export type PutBody = { baseV: number; blob: string };

export type ReadResult =
	| { status: 'missing' }
	| { status: 'unchanged'; etag: string }
	| { status: 'ok'; etag: string; room: StoredRoom };

export type WriteResult =
	{ status: 'ok'; v: number } | { status: 'conflict'; room: StoredRoom } | { status: 'too-large' };

export function roomPath(roomId: string): string {
	return `rooms/${roomId}.json`;
}

export function isRoomId(value: string | undefined): value is string {
	return typeof value === 'string' && ROOM_ID_PATTERN.test(value);
}

/**
 * The version token a conditional read compares against.
 *
 * Derived from the document's own `v`, which increments on every accepted
 * write. An earlier draft used the blob's upload time and size instead, to
 * answer a conditional read without fetching the body — but two writes in the
 * same millisecond whose JSON happens to be the same length produce an
 * identical token, and the second one is then reported as unchanged. The saved
 * fetch is not worth a lost edit.
 */
export function etagFor(room: StoredRoom): string {
	return `"${room.v}"`;
}

/**
 * Validates a PUT body strictly: exactly these two fields, nothing else.
 * Unknown fields are rejected rather than ignored, so a future field cannot be
 * smuggled past a handler that predates it.
 */
export function parsePutBody(value: unknown): PutBody | null {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;

	const keys = Object.keys(value);
	if (keys.length !== 2 || !keys.includes('baseV') || !keys.includes('blob')) return null;

	const { baseV, blob } = value as Record<string, unknown>;

	if (typeof baseV !== 'number' || !Number.isInteger(baseV) || baseV < 0) return null;
	if (typeof blob !== 'string' || blob.length === 0 || !BASE64.test(blob)) return null;

	return { baseV, blob };
}

export class RoomStore {
	#blobs: Blobs;
	/**
	 * Collapses a burst of reads from several devices into one blob call.
	 * Two seconds is short enough that a sync never serves a stale version to
	 * the person who just wrote it — the cache is dropped on write regardless —
	 * and long enough to matter on a warm instance.
	 */
	#cache = new Map<string, { at: number; room: StoredRoom | null }>();
	#ttl: number;
	#now: () => number;

	constructor(blobs: Blobs, options: { cacheMs?: number; now?: () => number } = {}) {
		this.#blobs = blobs;
		this.#ttl = options.cacheMs ?? 2000;
		this.#now = options.now ?? Date.now;
	}

	async read(roomId: string, ifNoneMatch: string | null): Promise<ReadResult> {
		const room = await this.#load(roomPath(roomId));

		// A stored object we cannot parse is reported as missing rather than as
		// an error: never build an oracle that tells the difference.
		if (!room) return { status: 'missing' };

		const etag = etagFor(room);
		if (ifNoneMatch !== null && matches(ifNoneMatch, etag)) {
			return { status: 'unchanged', etag };
		}

		return { status: 'ok', etag, room };
	}

	/**
	 * Vercel Blob has no compare-and-set, so this read-then-write can lose a
	 * race between two simultaneous writers. That is accepted rather than
	 * papered over: the client re-reads after every write and pushes again if
	 * its own stamps did not come back, which is what actually makes a lost
	 * write self-healing.
	 */
	async write(roomId: string, body: PutBody): Promise<WriteResult> {
		if (byteLength(body.blob) > MAX_BLOB_BYTES) return { status: 'too-large' };

		const path = roomPath(roomId);
		const existing = parseStored((await this.#blobs.get(path)) ?? '');
		const current = existing?.v ?? 0;

		if (body.baseV !== current) {
			return { status: 'conflict', room: existing ?? { v: 0, blob: '', at: 0 } };
		}

		const next: StoredRoom = { v: current + 1, blob: body.blob, at: this.#now() };
		await this.#blobs.put(path, JSON.stringify(next));
		this.#cache.set(path, { at: this.#now(), room: next });

		return { status: 'ok', v: next.v };
	}

	/** The whole cleanup story: no TTL, no touch-on-read, no per-request logic. */
	async sweep(now = this.#now(), maxAge = EXPIRY_MS): Promise<number> {
		const cutoff = now - maxAge;
		const entries = await this.#blobs.list('rooms/');

		let deleted = 0;
		for (const entry of entries) {
			if (entry.uploadedAt.getTime() >= cutoff) continue;
			await this.#blobs.del(entry.pathname);
			this.#cache.delete(entry.pathname);
			deleted++;
		}

		return deleted;
	}

	async #load(path: string): Promise<StoredRoom | null> {
		const cached = this.#cache.get(path);
		if (cached && this.#now() - cached.at < this.#ttl) return cached.room;

		const room = parseStored((await this.#blobs.get(path)) ?? '');
		this.#cache.set(path, { at: this.#now(), room });
		return room;
	}
}

function matches(ifNoneMatch: string, etag: string): boolean {
	return ifNoneMatch
		.split(',')
		.map((value) => value.trim().replace(/^W\//, ''))
		.includes(etag);
}

function parseStored(body: string): StoredRoom | null {
	try {
		const value: unknown = JSON.parse(body);
		if (typeof value !== 'object' || value === null) return null;

		const { v, blob, at } = value as Record<string, unknown>;
		if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) return null;
		if (typeof blob !== 'string') return null;
		if (typeof at !== 'number') return null;

		return { v, blob, at };
	} catch {
		return null;
	}
}

function byteLength(value: string): number {
	return new TextEncoder().encode(value).length;
}
