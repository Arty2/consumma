<script lang="ts">
	import { handRect } from '$lib/draw/hand';
	import { seedFrom } from '$lib/draw/rng';
	import { sync } from '$lib/state/sync.svelte';

	type Props = { onopen: () => void };

	let { onopen }: Props = $props();

	/*
	 * A mark, not a button: a small square in the sheet's top-right corner.
	 * Solid when synced, hollow when there are unsent edits, dashed when
	 * offline. Under manual sync, hollow is its common and most useful state —
	 * it is the honest answer to "has what I wrote left this phone?".
	 */
	const SIZE = 12;
	const box = handRect(SIZE, SIZE, { seed: seedFrom('status'), wobble: 0.8, overshoot: 1.4 });

	const label = $derived(
		sync.status === 'synced'
			? 'Synced'
			: sync.status === 'offline'
				? 'Offline — changes are saved here'
				: sync.unsent === 1
					? '1 change not sent'
					: `${sync.unsent} changes not sent`
	);
</script>

<button class="mark" type="button" onclick={onopen} aria-label={label} title={label}>
	<svg viewBox="0 0 {SIZE} {SIZE}" width={SIZE} height={SIZE} aria-hidden="true">
		<path
			d={box}
			class="drawn"
			class:drawn--dashed={sync.status === 'offline'}
			fill={sync.status === 'synced' ? 'var(--ink)' : 'none'}
		/>
	</svg>
</button>

<style>
	.mark {
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
