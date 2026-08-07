/**
 * Reading the clipboard is unreliable, so nothing is built on it alone.
 *
 * Writing is well supported and still falls back. Reading rejects outright in
 * Firefox, and Safari raises a permission prompt that is expected rather than
 * an error — so a refusal returns null and the caller opens a textarea to
 * paste into.
 */

export async function copy(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
}

/** Null means "ask them to paste it", not "something went wrong". */
export async function paste(): Promise<string | null> {
	try {
		if (!navigator.clipboard?.readText) return null;
		return await navigator.clipboard.readText();
	} catch {
		return null;
	}
}

export type ShareResult = 'shared' | 'dismissed' | 'copied' | 'failed';

/**
 * The native share sheet, then the modal.
 *
 * Called synchronously inside the click handler, before any await — browsers
 * require the call to happen in the user gesture, and deriving a string first
 * throws NotAllowedError.
 *
 * The code travels as text beside a bare URL, never inside it. A URL carrying
 * the key would end up in browser history, in link previews, and in whatever
 * service renders the message.
 */
export function share(text: string, url: string): Promise<ShareResult> {
	if (typeof navigator.share !== 'function') {
		return copy(text).then((ok) => (ok ? 'copied' : 'failed'));
	}

	return navigator.share({ text, url }).then(
		() => 'shared' as const,
		(error: unknown) => {
			// Dismissing the share sheet is not a failure.
			if (error instanceof Error && error.name === 'AbortError') return 'dismissed';
			return copy(text).then((ok) => (ok ? 'copied' : 'failed'));
		}
	);
}
