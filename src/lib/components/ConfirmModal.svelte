<script lang="ts">
	import HandRect from './HandRect.svelte';
	import Modal from './Modal.svelte';
	import type { Snippet } from 'svelte';

	type Props = {
		title: string;
		seed: string;
		/** The destructive word. Not "OK", and never "Are you sure?". */
		confirmLabel: string;
		onconfirm: () => void;
		oncancel: () => void;
		children: Snippet;
	};

	let { title, seed, confirmLabel, onconfirm, oncancel, children }: Props = $props();

	/*
	 * A sentence saying exactly what will happen and to whom, then two words.
	 * No red, no warning triangle, no "Are you sure?" — the sentence does that
	 * work, and red is not a colour this app has.
	 */
</script>

<Modal {title} {seed} onclose={oncancel}>
	<p class="sentence">{@render children()}</p>

	<div class="choices">
		<button type="button" class="caps boxed" onclick={onconfirm}>
			<HandRect seed="{seed}confirm" wobble={1.4} radius={3} />
			{confirmLabel}
		</button>
		<button type="button" class="caps boxed" onclick={oncancel}>
			<HandRect seed="{seed}cancel" wobble={1.4} radius={3} />
			Cancel
		</button>
	</div>
</Modal>

<style>
	/*
	 * The sentence is the warning — there is no red and no triangle to carry it
	 * — so it is set at the size the menu sets its own prose, not a footnote
	 * under a pair of buttons.
	 */
	.sentence {
		margin: 0 0 2rem;
		font-size: var(--size-title);
		line-height: 1.3;
		text-align: center;
		transform: rotate(var(--instruction-tilt));
		transform-origin: var(--instruction-origin);
	}

	/* Centred, and boxed by `.boxed`, the same as every other pair of actions. */
	.choices {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-wrap: wrap;
		gap: 1rem;
	}
</style>
