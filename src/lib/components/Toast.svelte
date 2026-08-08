<script lang="ts">
	import HandRect from './HandRect.svelte';
	import { ui } from '$lib/state/ui.svelte';
</script>

{#if ui.toast}
	<div class="toast" role="status" aria-live="polite">
		<HandRect seed="toast" wobble={2} />
		<span class="caps">{ui.toast.text}</span>
		{#if ui.toast.undo}
			<button type="button" class="caps" onclick={ui.toast.undo}>UNDO?</button>
		{/if}
	</div>
{/if}

<style>
	.toast {
		position: fixed;
		left: 50%;
		bottom: calc(1rem + env(safe-area-inset-bottom));
		translate: -50% 0;
		display: flex;
		align-items: center;
		/*
		 * The message keeps to the left, where the sheet's own writing starts,
		 * and UNDO goes to the far end. Huddled together they left most of a
		 * sheet-wide bar empty, which read as a box drawn round nothing.
		 */
		justify-content: space-between;
		gap: 1rem;
		/*
		 * A bar rather than a label, but inset from the paper on both sides so it
		 * reads as sitting in front of the sheet rather than as part of it.
		 */
		width: min(24rem, calc(100vw - 4rem));
		padding: 0.5rem 1rem;
		background: var(--paper);
	}

	/*
	 * The words sit on the middle of the box rather than the middle of their own
	 * line. Graphe's capitals ride high in their line box, so centring the box
	 * on the row left them above it — the same correction every drawn thing
	 * beside capitals makes, in the other direction.
	 */
	.toast :global(svg.rect) {
		translate: 0 calc(-1 * var(--cap-lift));
	}
</style>
