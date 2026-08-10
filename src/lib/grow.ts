/**
 * Keeps a textarea exactly as tall as what is written in it.
 *
 * A task is one string and stays one string — this is not about tasks holding
 * newlines, which `clean` strips at the boundary. It is about a row not
 * changing shape when it is tapped. A task long enough to wrap is drawn over
 * two lines when it is being read, and a single-line field underneath it would
 * reflow the whole sheet on every tap and hide the end of the task behind its
 * own left edge.
 *
 * Through the CSSOM rather than a style attribute: the policy is
 * `style-src 'self'` with one pinned hash, and a written attribute would need
 * `'unsafe-inline'`. CSP does not govern the CSSOM, which is also how Svelte's
 * own `style:` directive works.
 *
 * `field-sizing: content` does this in CSS and is not in Safari, which is most
 * of the phones this runs on. Retire the action when it is.
 */
export function grow(node: HTMLTextAreaElement, value: string) {
	// The parameter is the dependency, not an input: Svelte re-runs `update`
	// when it changes, and the field is measured rather than read from it.
	void value;

	function fit() {
		// Collapse first: scrollHeight never reports less than the current
		// height, so a field that has just lost a line would stay tall.
		node.style.height = 'auto';
		node.style.height = `${node.scrollHeight}px`;
	}

	fit();

	/*
	 * The face arrives after the first paint — `font-display: swap` — and the
	 * fallback wraps at a different width, so a field fitted before the swap is
	 * fitted to the wrong text. Nothing to clean up if the browser has no font
	 * loading API; the field is simply a line out until the next keystroke.
	 */
	document.fonts?.ready.then(fit);

	return {
		update(next: string) {
			void next;
			fit();
		}
	};
}
