import { LIMITS } from '$lib/doc/limits';

/**
 * The envelope.
 *
 *   plaintext = deflate-raw(JSON.stringify(doc))
 *   iv        = 12 random bytes, fresh per write
 *   blob      = base64( version(1) ‖ iv ‖ AES-GCM(key, iv, plaintext) )
 *
 * The version byte is not in the original sketch, which made compression
 * "optional". It cannot be optional past the first write — a reader cannot
 * tell a compressed payload from an uncompressed one — so the choice has to be
 * recorded somewhere. One byte buys a future change of compression or cipher
 * parameters without orphaning every existing list, which is the same
 * insurance `consumma:v1` buys on the salt.
 */

export const ENVELOPE_VERSION = 1;
const IV_BYTES = 12;

/** Seals a document for the server, which only ever sees the result. */
export async function seal(key: CryptoKey, value: unknown): Promise<string> {
	const json = new TextEncoder().encode(JSON.stringify(value));
	const plaintext = await deflate(json);

	const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
	const ciphertext = new Uint8Array(
		await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)
	);

	const envelope = new Uint8Array(1 + IV_BYTES + ciphertext.length);
	envelope[0] = ENVELOPE_VERSION;
	envelope.set(iv, 1);
	envelope.set(ciphertext, 1 + IV_BYTES);

	return toBase64(envelope);
}

/**
 * Opens an envelope, or returns null.
 *
 * A failed decrypt is a normal, expected outcome — it is what a wrong code
 * looks like. It never throws, so no caller is tempted to surface a stack
 * trace where "That code doesn't match a list" belongs.
 */
export async function open(key: CryptoKey, blob: string): Promise<unknown | null> {
	try {
		const envelope = fromBase64(blob);
		if (envelope.length <= 1 + IV_BYTES) return null;
		if (envelope[0] !== ENVELOPE_VERSION) return null;

		const iv = envelope.subarray(1, 1 + IV_BYTES);
		const ciphertext = envelope.subarray(1 + IV_BYTES);

		// AES-GCM authenticates: tampered ciphertext fails here rather than
		// producing plausible rubbish.
		const plaintext = new Uint8Array(
			await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
		);

		const json = await inflate(plaintext, LIMITS.plaintextBytes);
		if (json === null) return null;

		return JSON.parse(new TextDecoder().decode(json));
	} catch {
		return null;
	}
}

// ── compression ──────────────────────────────────────────────────────────────

async function deflate(bytes: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
	const stream = new Blob([bytes as BlobPart])
		.stream()
		.pipeThrough(new CompressionStream('deflate-raw'));

	return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Caps the decompressed size before anything parses it, so a small blob
 * cannot expand into a large allocation.
 */
async function inflate(bytes: Uint8Array, max: number): Promise<Uint8Array<ArrayBuffer> | null> {
	const stream = new Blob([bytes as BlobPart])
		.stream()
		.pipeThrough(new DecompressionStream('deflate-raw'));

	const reader = stream.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;

	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;

		size += value.length;
		if (size > max) {
			await reader.cancel();
			return null;
		}
		chunks.push(value);
	}

	const out = new Uint8Array(size);
	let at = 0;
	for (const chunk of chunks) {
		out.set(chunk, at);
		at += chunk.length;
	}
	return out;
}

// ── base64 ───────────────────────────────────────────────────────────────────

function toBase64(bytes: Uint8Array): string {
	let binary = '';
	// Chunked, because spreading a large array into String.fromCharCode blows
	// the argument limit.
	for (let i = 0; i < bytes.length; i += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	}
	return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
	const binary = atob(value);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}
