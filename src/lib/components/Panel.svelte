<script lang="ts">
	import HandRect from './HandRect.svelte';
	import { trap } from '$lib/a11y/trap';
	import { handCross } from '$lib/draw/hand';
	import { seedFrom } from '$lib/draw/rng';
	import type { Snippet } from 'svelte';

	/*
	 * Everything that covers the sheet: the modal and the menu.
	 *
	 * Opaque white with a hand-drawn border inset from the edges. No scrim —
	 * dimming the page means grey, and grey does not exist here. It simply covers
	 * what is behind it. Escape closes it; there is no backdrop to click.
	 *
	 * The two differ in one thing, which is the axis they are thrown away along:
	 * the modal comes up the screen and goes back down it, the menu comes in from
	 * the right and goes back out that way. Everything else was written twice,
	 * and the copy that drifts is always the one nobody is looking at.
	 */

	type Props = {
		title: string;
		seed: string;
		/** Which way it leaves: down the screen, or off the right of it. */
		axis: 'x' | 'y';
		onclose: () => void;
		children: Snippet;
	};

	let { title, seed, axis, onclose, children }: Props = $props();

	const cross = $derived(handCross(20, { seed: seedFrom(`close${seed}`), wobble: 0.8 }));

	let panel = $state<HTMLElement | null>(null);
	let offset = $state(0);
	let dragStart: { at: number; from: number } | null = null;

	const along = (event: PointerEvent) => (axis === 'x' ? event.clientX : event.clientY);

	function onpointerdown(event: PointerEvent) {
		if (event.button !== 0) return;
		// A drag that starts on something you can operate is not a dismissal.
		if ((event.target as HTMLElement).closest('input, textarea, button')) return;

		dragStart = { at: performance.now(), from: along(event) };
	}

	function onpointermove(event: PointerEvent) {
		if (!dragStart) return;
		// One direction only: it never lifts off the far edge of the screen.
		offset = Math.max(0, along(event) - dragStart.from);
	}

	function onpointerup(event: PointerEvent) {
		if (!dragStart || !panel) return;

		const travelled = along(event) - dragStart.from;
		const elapsed = performance.now() - dragStart.at;
		const flick = travelled > 40 && elapsed < 250;
		const span = axis === 'x' ? panel.clientWidth : panel.clientHeight;

		dragStart = null;

		if (flick || travelled > span * 0.25) onclose();
		else offset = 0; // Springs back.
	}
</script>

<div
	class="panel {axis}"
	role="dialog"
	aria-modal="true"
	aria-label={title}
	tabindex="-1"
	bind:this={panel}
	style:--offset="{offset}px"
	use:trap={onclose}
	{onpointerdown}
	{onpointermove}
	{onpointerup}
	onpointercancel={() => {
		dragStart = null;
		offset = 0;
	}}
>
	<div class="frame" aria-hidden="true">
		<HandRect {seed} wobble={2.2} />
	</div>

	<button class="close" type="button" onclick={onclose} aria-label="Close">
		<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
			<path d={cross} class="drawn" />
		</svg>
	</button>

	{@render children()}
</div>

<style>
	.panel {
		position: fixed;
		top: 0;
		bottom: 0;
		z-index: 10;
		background: var(--paper);
		display: flex;
		flex-direction: column;
		padding: calc(2rem + env(safe-area-inset-top)) 1.75rem calc(2rem + env(safe-area-inset-bottom));
		outline: none;
	}

	/* Down the screen. */
	.y {
		left: 0;
		right: 0;
		touch-action: pan-y;
		translate: 0 var(--offset, 0);
	}

	/*
	 * From the right, and the full width of a phone — at that size a drawer and
	 * a panel are the same thing, and half a sheet of paper is not a shape this
	 * app has.
	 */
	.x {
		right: 0;
		width: min(24rem, 100%);
		touch-action: pan-y;
		translate: var(--offset, 0);
	}

	/*
	 * The frame is the edge and stays put; content scrolls inside it. Framing
	 * the scrolled content instead leaves the last line hanging outside the
	 * border, because an absolutely positioned box in a scroll container sizes
	 * to the visible box rather than to what it holds.
	 */
	.frame {
		position: absolute;
		inset: 0.75rem;
		pointer-events: none;
	}

	.close {
		position: absolute;
		top: calc(1.1rem + env(safe-area-inset-top));
		right: 1.1rem;
		width: var(--touch);
		height: var(--touch);
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
</style>
