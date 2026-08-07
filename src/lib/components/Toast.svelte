<script lang="ts">
	import HandRect from './HandRect.svelte';
	import { ui } from '$lib/state/ui.svelte';
</script>

{#if ui.toast}
	<div class="toast" role="status" aria-live="polite">
		<HandRect seed="toast" wobble={2} />
		<span class="caps">{ui.toast.text}</span>
		{#if ui.toast.undo}
			<button type="button" class="caps" onclick={ui.toast.undo}>UNDO</button>
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
		 * The paper's own width, not a width of its own: .page caps at 34rem and
		 * pads 1rem, so the sheet spans this exactly. A toast narrower than the
		 * thing it reports on reads as belonging to something else.
		 */
		width: min(32rem, calc(100vw - 2rem));
		padding: 0.5rem 1rem;
		background: var(--paper);
	}
</style>
