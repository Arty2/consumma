const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** Ids that survive validation of a decrypted document (§13). */
export const ID_PATTERN = /^[A-Za-z0-9]{1,24}$/;

/**
 * Random base62. Ids only ever have to be unique between two phones, so the
 * modulo bias here is irrelevant — this is not key material, and nothing about
 * an id is secret.
 */
export function newId(length = 12): string {
	const bytes = new Uint8Array(length);
	crypto.getRandomValues(bytes);

	let out = '';
	for (const byte of bytes) out += ALPHABET[byte % ALPHABET.length];
	return out;
}

export function isId(value: unknown): value is string {
	return typeof value === 'string' && ID_PATTERN.test(value);
}
