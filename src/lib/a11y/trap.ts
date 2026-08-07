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

		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}

	node.addEventListener('keydown', onkeydown);

	return {
		update(next: () => void) {
			close = next;
		},
		destroy() {
			node.removeEventListener('keydown', onkeydown);
			document.body.style.overflow = overflow;
			previous?.focus();
		}
	};
}
