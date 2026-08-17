<script lang="ts">
	import { handBurger } from '$lib/draw/hand';
	import { seedFrom } from '$lib/draw/rng';
	import { tapped } from '$lib/feel';
	import { t } from '$lib/i18n';

	/*
	 * Three strokes, and nothing else. What is waiting to be synced is said by
	 * the button beside it — a menu that changed shape to report sync state was
	 * two jobs on one control, and neither read clearly.
	 */

	type Props = { onopen: () => void };

	let { onopen }: Props = $props();

	const SIZE = 22;

	// Drawn once, never re-seeded.
	const burger = handBurger(SIZE, { seed: seedFrom('burger'), wobble: 0.7 });
</script>

<button
	class="menu-button"
	type="button"
	onclick={() => {
		tapped();
		onopen();
	}}
	aria-label={t.menu.label}
	title={t.menu.label}
>
	<svg viewBox="0 0 {SIZE} {SIZE}" width={SIZE} height={SIZE} aria-hidden="true">
		<path d={burger} class="drawn" />
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
