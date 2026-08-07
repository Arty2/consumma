<script lang="ts">
	import HandRect from './HandRect.svelte';
	import { handCross, handLine } from '$lib/draw/hand';
	import { seedFrom } from '$lib/draw/rng';
	import type { Snippet } from 'svelte';

	type Props = {
		title: string;
		seed: string;
		onclose: () => void;
		children: Snippet;
	};

	let { title, seed, onclose, children }: Props = $props();

	/*
	 * One component for SHARE, SYNC, IMPORT and the two confirms.
	 *
	 * Opaque white, full viewport, with a hand-drawn border inset from the edges.
	 * No scrim: dimming the page means grey, and grey does not exist here. The
	 * panel simply covers what is behind it. Escape closes it; there is no
	 * backdrop to click.
	 */

	const cross = $derived(handCross(20, { seed: seedFrom(`close${seed}`), wobble: 0.8 }));
	const grip = $derived(handLine(64, { seed: seedFrom(`grip${seed}`), wobble: 1.1, y: 2 }));

	let panel = $state<HTMLElement | null>(null);
	let offset = $state(0);
	let dragStart: { y: number; at: number } | null = null;

	$effect(() => {
		const previous = document.activeElement as HTMLElement | null;
		const overflow = document.body.style.overflow;

		document.body.style.overflow = 'hidden';
		panel?.focus();

		return () => {
			document.body.style.overflow = overflow;
			previous?.focus();
		};
	});

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			onclose();
			return;
		}

		if (event.key !== 'Tab' || !panel) return;

		const focusable = [
			...panel.querySelectorAll<HTMLElement>(
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

	function onpointerdown(event: PointerEvent) {
		if (event.button !== 0) return;
		if ((event.target as HTMLElement).closest('input, textarea, button')) return;
		dragStart = { y: event.clientY, at: performance.now() };
	}

	function onpointermove(event: PointerEvent) {
		if (!dragStart) return;
		// Downwards only; the panel does not lift off the top of the screen.
		offset = Math.max(0, event.clientY - dragStart.y);
	}

	function onpointerup(event: PointerEvent) {
		if (!dragStart || !panel) return;

		const travelled = event.clientY - dragStart.y;
		const elapsed = performance.now() - dragStart.at;
		const flick = travelled > 40 && elapsed < 250;

		dragStart = null;

		if (flick || travelled > panel.clientHeight * 0.25) onclose();
		else offset = 0; // Springs back.
	}
</script>

<div
	class="panel"
	role="dialog"
	aria-modal="true"
	aria-label={title}
	tabindex="-1"
	bind:this={panel}
	style:--offset="{offset}px"
	{onkeydown}
	{onpointerdown}
	{onpointermove}
	{onpointerup}
	onpointercancel={() => {
		dragStart = null;
		offset = 0;
	}}
>
	<HandRect {seed} wobble={2.2} />

	<div class="grip" aria-hidden="true">
		<svg viewBox="0 0 64 5" width="64" height="5">
			<path d={grip} class="drawn" />
		</svg>
	</div>

	<button class="close" type="button" onclick={onclose} aria-label="Close">
		<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
			<path d={cross} class="drawn" />
		</svg>
	</button>

	<div class="body">
		{@render children()}
	</div>
</div>

<style>
	.panel {
		position: fixed;
		inset: 0;
		z-index: 10;
		background: var(--paper);
		padding: calc(1.25rem + env(safe-area-inset-top)) 1.25rem
			calc(1.25rem + env(safe-area-inset-bottom));
		overflow-y: auto;
		outline: none;
		touch-action: pan-y;
		translate: 0 var(--offset, 0);
	}

	.grip {
		display: flex;
		justify-content: center;
		padding-bottom: 0.75rem;
	}

	.close {
		position: absolute;
		top: calc(0.5rem + env(safe-area-inset-top));
		right: 0.5rem;
		width: var(--touch);
		height: var(--touch);
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	.body {
		max-width: 34rem;
		margin: 0 auto;
		padding-top: 1.5rem;
	}
</style>
