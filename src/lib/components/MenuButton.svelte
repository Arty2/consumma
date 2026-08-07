<script lang="ts">
	import { handArrow, handBurger } from '$lib/draw/hand';
	import { seedFrom } from '$lib/draw/rng';
	import { sync } from '$lib/state/sync.svelte';

	/*
	 * The only control on the page. Three strokes normally; an arrow up and out
	 * when something is waiting to go.
	 *
	 * The arrow is not a warning light. It says there is an outbox and it is not
	 * empty — which under manual sync is a common and perfectly good state, and
	 * the reason the mark it replaced had to be explained every time. What is
	 * waiting, and why, is spelt out in words the moment the menu opens.
	 */

	type Props = { onopen: () => void };

	let { onopen }: Props = $props();

	const SIZE = 22;

	// Drawn once each, never re-seeded, so the strokes do not twitch when the
	// count changes underneath them.
	const burger = handBurger(SIZE, { seed: seedFrom('burger'), wobble: 0.7 });
	const arrow = handArrow(SIZE, { seed: seedFrom('arrow'), wobble: 0.7 });

	const waiting = $derived(sync.unsent > 0);

	const label = $derived(
		waiting
			? sync.unsent === 1
				? 'Menu — 1 change waiting to go'
				: `Menu — ${sync.unsent} changes waiting to go`
			: 'Menu'
	);
</script>

<button class="menu-button" type="button" onclick={onopen} aria-label={label} title={label}>
	<svg viewBox="0 0 {SIZE} {SIZE}" width={SIZE} height={SIZE} aria-hidden="true">
		<path d={waiting ? arrow : burger} class="drawn" />
	</svg>
</button>

<style>
	.menu-button {
		width: var(--touch);
		height: var(--touch);
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	svg {
		overflow: visible;
	}
</style>
