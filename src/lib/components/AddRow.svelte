<script lang="ts">
	import { langOf } from '$lib/doc/lang';
	import { LIMITS } from '$lib/doc/limits';
	import { handRect } from '$lib/draw/hand';
	import { seedFrom } from '$lib/draw/rng';
	import { tapped } from '$lib/feel';

	type Props = {
		/** Returns true if the task was created, so the row can stay open. */
		onadd: (text: string) => boolean;
		seed: string;
		disabled?: boolean;
		/** Opened by the parent: Enter on a task puts one of these beneath it. */
		opened?: boolean;
		onclose?: () => void;
	};

	let { onadd, seed, disabled = false, opened = false, onclose }: Props = $props();

	const SIZE = 22;
	const box = $derived(
		handRect(SIZE, SIZE, { seed: seedFrom(`add${seed}`), wobble: 1.3, overshoot: 2.2 })
	);

	let byTap = $state(false);
	let draft = $state('');
	let input = $state<HTMLInputElement | null>(null);

	/** Open because it was tapped, or because the parent put it here open. */
	const open = $derived(byTap || opened);

	// Placed already open rather than tapped: take the caret with it.
	$effect(() => {
		if (opened) queueMicrotask(() => input?.focus());
	});

	/*
	 * An empty checkbox followed by an ellipsis. Not a button, not a plus — the
	 * next box in the list, waiting. Committing creates the task and leaves a
	 * fresh empty box beneath, so a burst of five things is five lines of
	 * typing. The ghost box is never a real task and never counts toward the
	 * hundred.
	 */

	function start() {
		if (disabled) return;
		byTap = true;
		queueMicrotask(() => input?.focus());
	}

	function commit(keepOpen: boolean) {
		const text = draft.trim();

		if (text === '') {
			// Enter on an empty box does nothing.
			byTap = false;
			onclose?.();
			return;
		}

		if (onadd(text)) {
			draft = '';
			tapped();
		}
		if (keepOpen) queueMicrotask(() => input?.focus());
		else {
			byTap = false;
			onclose?.();
		}
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			commit(true);
		} else if (event.key === 'Escape') {
			event.preventDefault();
			draft = '';
			byTap = false;
			onclose?.();
		}
	}
</script>

<li class="row">
	<!--
		Tappable, because it looks it: an empty box in a 44px target beside a row
		that opens on a tap is not something to leave inert.

		Out of the accessibility tree and out of the tab order all the same — the
		ellipsis beside it is the same action with a real label, and two stops for
		one thing is worse than none.
	-->
	<button class="box" type="button" tabindex="-1" aria-hidden="true" {disabled} onclick={start}>
		<svg viewBox="0 0 {SIZE} {SIZE}" width={SIZE} height={SIZE}>
			<path d={box} class="drawn" class:ghost={!open} class:pending={open} />
		</svg>
	</button>

	{#if open}
		<!--
			Caps here too: a task being typed has to look like the task it becomes,
			the way a group title already does. Without it the line changes shape
			the moment it is committed.
		-->
		<input
			class="text caps"
			type="text"
			lang={langOf(draft)}
			bind:this={input}
			bind:value={draft}
			maxlength={LIMITS.taskText}
			aria-label="New task"
			onblur={() => commit(false)}
			{onkeydown}
		/>
	{:else}
		<button class="text caps" type="button" onclick={start} {disabled} aria-label="Add a task">
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
		font-size: var(--size-task);
	}

	.box {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: var(--touch);
		height: var(--touch);
		flex: 0 0 var(--touch);
		/* Level with the capitals beside it, not with their line box. */
		position: relative;
		top: calc(-1 * var(--cap-lift));
		/* It opens a text field, so it offers the same cursor the field does. */
		cursor: text;
	}

	.box:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.box svg {
		overflow: visible;
	}

	/*
	 * Drawn but not shown, until there is something being written in it.
	 *
	 * An empty square at the end of a list read as one more thing to do rather
	 * than as room for one — but once the row is open it is the box that task is
	 * about to get, and it should be there to see. Faint, like everything else
	 * that is not quite real yet.
	 *
	 * Its own rule rather than a change to --faint, which is a value and not a
	 * switch.
	 */
	.ghost {
		opacity: 0;
	}

	/* Open: the box that task is about to get, as faint as the words in it. */
	.pending {
		opacity: var(--faint);
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

	/*
	 * The same glyph as the new-group row below, so it is set the same way: the
	 * title's size, and as faint as the rule and the box that go with it. It is
	 * one thing meaning "there could be more here", and it should not change
	 * size depending on which kind of more.
	 */
	button.text {
		font-size: var(--size-title);
		opacity: var(--faint);
	}

	input.text {
		outline: none;
	}
</style>
