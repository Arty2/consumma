/**
 * Compares two secrets without leaking their contents through how long the
 * comparison takes.
 *
 * Lengths are hashed in rather than short-circuited on, so an attacker cannot
 * learn the secret's length from a fast rejection.
 */
export function constantTimeEqual(a: string, b: string): boolean {
	const left = new TextEncoder().encode(a);
	const right = new TextEncoder().encode(b);

	let diff = left.length ^ right.length;
	const length = Math.max(left.length, right.length);

	for (let i = 0; i < length; i++) {
		diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
	}

	return diff === 0;
}

/** `Authorization: Bearer <secret>`, and nothing else. */
export function bearerMatches(header: string | null, secret: string | undefined): boolean {
	if (!header || !secret) return false;

	const prefix = 'Bearer ';
	if (!header.startsWith(prefix)) return false;

	return constantTimeEqual(header.slice(prefix.length), secret);
}
