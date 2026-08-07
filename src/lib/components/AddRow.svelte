<script lang="ts">
	import { LIMITS } from '$lib/doc/limits';
	import { handRect } from '$lib/draw/hand';
	import { seedFrom } from '$lib/draw/rng';

	type Props = {
		/** Returns true if the task was created, so the row can stay open. */
		onadd: (text: string) => boolean;
		seed: string;
		disabled?: boolean;
	};

	let { onadd, seed, disabled = false }: Props = $props();

	const SIZE = 22;
	const box = $derived(
		handRect(SIZE, SIZE, { seed: seedFrom(`add${seed}`), wobble: 1.3, overshoot: 2.2 })
	);

	let open = $state(false);
	let draft = $state('');
	let input = $state<HTMLInputElement | null>(null);

	/*
	 * An empty checkbox followed by an ellipsis. Not a button, not a plus — the
	 * next box in the list, waiting. Committing creates the task and leaves a
	 * fresh empty box beneath, so a burst of five things is five lines of
	 * typing. The ghost box is never a real task and never counts toward the
	 * hundred.
	 */

	function start() {
		if (disabled) return;
		open = true;
		queueMicrotask(() => input?.focus());
	}

	function commit(keepOpen: boolean) {
		const text = draft.trim();

		if (text === '') {
			// Enter on an empty box does nothing.
			open = false;
			return;
		}

		if (onadd(text)) draft = '';
		if (keepOpen) queueMicrotask(() => input?.focus());
		else open = false;
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			commit(true);
		} else if (event.key === 'Escape') {
			event.preventDefault();
			draft = '';
			open = false;
		}
	}
</script>

<li class="row">
	<span class="box" aria-hidden="true">
		<svg viewBox="0 0 {SIZE} {SIZE}" width={SIZE} height={SIZE}>
			<path d={box} class="drawn drawn--faint" />
		</svg>
	</span>

	{#if open}
		<input
			class="text"
			type="text"
			bind:this={input}
			bind:value={draft}
			maxlength={LIMITS.taskText}
			aria-label="New task"
			onblur={() => commit(false)}
			{onkeydown}
		/>
	{:else}
		<button class="text" type="button" onclick={start} {disabled} aria-label="Add a task">
			…
		</button>
	{/if}
</li>

<style>
	.row {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		min-height: var(--touch);
		list-style: none;
	}

	.box {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: var(--touch);
		height: var(--touch);
		flex: 0 0 var(--touch);
	}

	.box svg {
		overflow: visible;
	}

	.text {
		flex: 1 1 auto;
		min-width: 0;
		text-align: left;
		cursor: text;
	}

	.text:disabled {
		opacity: 0.4;
		cursor: default;
	}

	button.text {
		opacity: 0.55;
	}

	input.text {
		outline: none;
	}
</style>
