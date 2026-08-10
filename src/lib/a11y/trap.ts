/*
 * Everything a panel that covers the page has to do for a keyboard: hold focus
 * inside itself, hand it back to whatever opened it, close on Escape, and stop
 * the sheet behind it from scrolling.
 *
 * Shared by the modal and the menu. It was written twice for a while, and the
 * second copy is exactly the kind that drifts.
 */
export function trap(node: HTMLElement, onclose: () => void) {
	let close = onclose;

	const previous = document.activeElement as HTMLElement | null;
	const overflow = document.body.style.overflow;

	document.body.style.overflow = 'hidden';
	node.focus();

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			close();
			return;
		}

		if (event.key !== 'Tab') return;

		const focusable = [
			...node.querySelectorAll<HTMLElement>(
				'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
			)
		];
		if (focusable.length === 0) return;

		const first = focusable[0];
		const last = focusable[focusable.length - 1];

		/*
		 * Focus can end up outside the panel without anybody tabbing there: a
		 * button that disables itself when pressed — Sync now, while it cools —
		 * drops focus to the body on the spot. Tab from there would walk the
		 * sheet behind the panel, so it comes back inside instead.
		 */
		if (!node.contains(document.activeElement)) {
			event.preventDefault();
			(event.shiftKey ? last : first).focus();
			return;
		}

		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}

	/*
	 * On the document, not on the panel.
	 *
	 * A listener on the panel only ever sees a key if focus is inside it, and
	 * focus does not stay inside on its own: pressing Sync now disables that
	 * button, which blurs it to the body, and from there Escape reached nothing
	 * and the panel could not be closed by keyboard at all. A panel that covers
	 * the page has to answer Escape wherever the caret happens to be.
	 */
	document.addEventListener('keydown', onkeydown);

	return {
		update(next: () => void) {
			close = next;
		},
		destroy() {
			document.removeEventListener('keydown', onkeydown);
			document.body.style.overflow = overflow;
			previous?.focus();
		}
	};
}
