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
		gap: 1rem;
		max-width: min(32rem, calc(100vw - 2rem));
		padding: 0.5rem 1rem;
		background: var(--paper);
	}
</style>
