<script lang="ts">
	import Panel from './Panel.svelte';
	import { handLine } from '$lib/draw/hand';
	import { seedFrom } from '$lib/draw/rng';
	import type { Snippet } from 'svelte';

	/*
	 * One component for IMPORT and the two confirms: a panel that comes up the
	 * screen and is thrown back down it.
	 *
	 * The shell — the frame, the close ✕, the focus trap, the drag — is Panel's.
	 * What is left here is the grip, which says which way this one goes.
	 */

	type Props = {
		title: string;
		seed: string;
		onclose: () => void;
		children: Snippet;
	};

	let { title, seed, onclose, children }: Props = $props();

	const grip = $derived(handLine(64, { seed: seedFrom(`grip${seed}`), wobble: 1.1, y: 2 }));
</script>

<Panel {title} {seed} axis="y" {onclose}>
	<div class="grip" aria-hidden="true">
		<svg viewBox="0 0 64 5" width="64" height="5">
			<path d={grip} class="drawn" />
		</svg>
	</div>

	<div class="body">
		{@render children()}
	</div>
</Panel>

<style>
	.grip {
		display: flex;
		justify-content: center;
		padding-bottom: 0.75rem;
	}

	.body {
		flex: 1 1 auto;
		min-height: 0;
		overflow-y: auto;
		max-width: 34rem;
		width: 100%;
		margin: 0 auto;
		padding-top: 1.5rem;
	}
</style>
