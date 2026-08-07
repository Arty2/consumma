/**
 * JSON with object keys in sorted order, all the way down.
 *
 * Two things need it. The sealed blob should be byte-identical when the
 * document is unchanged, so a no-op sync does not write. And "do I have
 * anything unsent?" is answered by comparing the current document against the
 * one last synced — which has to be a comparison of content, not of whichever
 * order the keys happened to be built in.
 */
export function canonical(value: unknown): string {
	return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortKeys);

	if (typeof value === 'object' && value !== null) {
		const out: Record<string, unknown> = {};
		for (const key of Object.keys(value).sort()) {
			out[key] = sortKeys((value as Record<string, unknown>)[key]);
		}
		return out;
	}

	return value;
}
