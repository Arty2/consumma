<script lang="ts">
	import Sheet from '$lib/components/Sheet.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import TornEdge from '$lib/components/TornEdge.svelte';
	import { sheet } from '$lib/state/doc.svelte';
	import { ui } from '$lib/state/ui.svelte';

	/*
	 * The page opens scrolled so the torn top edge sits at the top of the
	 * viewport and SYNC · SHARE is just above it, out of sight. The app opens on
	 * the list, not on its controls.
	 *
	 * The controls stay first in the DOM, so tabbing to them scrolls them into
	 * view naturally — hidden is not the same as unreachable.
	 */
	let top = $state<HTMLElement | null>(null);
	let settled = false;

	$effect(() => {
		sheet.load();
		ui.load();
	});

	$effect(() => {
		if (settled || !top) return;
		settled = true;

		history.scrollRestoration = 'manual';
		// Jump, never smooth-scroll, and never again: if someone has scrolled up
		// to reach SYNC, a re-render must not yank them back down.
		requestAnimationFrame(() => {
			top?.scrollIntoView({ block: 'start', behavior: 'instant' });
		});
	});

	function clear() {
		const cleared = sheet.clearDone();
		if (cleared.length === 0) return;

		ui.say(`Cleared ${cleared.length}.`, () => {
			sheet.restore(cleared);
			ui.dismiss();
		});
	}
</script>

<div class="page">
	<nav class="above" aria-label="Sharing">
		<button type="button" class="caps" disabled>SYNC</button>
		<span aria-hidden="true">·</span>
		<button type="button" class="caps" disabled>SHARE</button>
	</nav>

	<div bind:this={top}>
		<TornEdge seed="top" />
	</div>

	<main data-sheet>
		<Sheet />
	</main>

	<TornEdge seed="bottom" flip />

	<nav class="below" aria-label="The list">
		<button type="button" class="caps" disabled>IMPORT</button>
		<span aria-hidden="true">·</span>
		<button type="button" class="caps" disabled>EXPORT</button>
	</nav>

	<nav class="below last" aria-label="Removing things">
		<button type="button" class="caps" disabled>DELETE</button>
		<span aria-hidden="true">·</span>
		<button
			type="button"
			class="caps"
			class:nothing={sheet.doneCount === 0}
			disabled={sheet.doneCount === 0}
			onclick={clear}
		>
			CLEAR
		</button>
	</nav>
</div>

<Toast />

<style>
	.page {
		max-width: 34rem;
		margin: 0 auto;
		padding: 0 1rem;
	}

	nav {
		display: flex;
		align-items: center;
		justify-content: center;
		/* Every action row fits one line at 320px, so none wraps. */
		flex-wrap: nowrap;
		gap: 0.5rem;
		min-height: var(--touch);
	}

	.above {
		padding-top: calc(1rem + env(safe-area-inset-top));
		padding-bottom: 1rem;
	}

	.below {
		padding-top: 1.25rem;
	}

	.last {
		padding-bottom: calc(1.5rem + env(safe-area-inset-bottom));
	}

	nav button {
		padding: 0.5rem;
		min-height: var(--touch);
		white-space: nowrap;
	}

	nav button:disabled {
		opacity: 0.4;
		cursor: default;
	}

	/* Drawn with a dashed outline when nothing is done. */
	.nothing {
		opacity: 0.4;
	}
</style>
