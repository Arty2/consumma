<script lang="ts">
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
		<button type="button" class="caps" onclick={onconfirm}>{confirmLabel}</button>
		<span aria-hidden="true">·</span>
		<button type="button" class="caps" onclick={oncancel}>Cancel</button>
	</div>
</Modal>

<style>
	.sentence {
		margin: 0 0 2rem;
		font-size: var(--size-body);
		line-height: 1.6;
	}

	.choices {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.choices button {
		padding: 0.5rem 0;
		min-height: var(--touch);
	}
</style>
