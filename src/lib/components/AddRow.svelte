<script lang="ts">
	import { untrack } from 'svelte';
	import Counter from './Counter.svelte';
	import { langOf } from '$lib/doc/lang';
	import { LIMITS } from '$lib/doc/limits';
	import { spill, splitAt } from '$lib/doc/spill';
	import { handRect } from '$lib/draw/hand';
	import { seedFrom } from '$lib/draw/rng';
	import { tapped } from '$lib/feel';
	import { grow } from '$lib/grow';
	import { t } from '$lib/i18n';

	type Props = {
		/** Returns true if the task was created, so the row can stay open. */
		onadd: (text: string) => boolean;
		seed: string;
		disabled?: boolean;
		/** Opened by the parent: Enter on a task puts one of these beneath it. */
		opened?: boolean;
		/**
		 * What the row above could not hold. A row opened by running past the
		 * limit starts with the rest of the sentence already in it.
		 */
		initial?: string;
		/** The only row on the sheet — see the note on `.ghost` below. */
		lone?: boolean;
		onclose?: () => void;
		/** Backspace on an empty row: it closes, and the task above opens. */
		onback?: () => void;
	};

	let {
		onadd,
		seed,
		disabled = false,
		opened = false,
		initial = '',
		lone = false,
		onclose,
		onback
	}: Props = $props();

	const SIZE = 22;
	const box = $derived(
		handRect(SIZE, SIZE, { seed: seedFrom(`add${seed}`), wobble: 1.3, overshoot: 2.2 })
	);

	let byTap = $state(false);
	/*
	 * Seeded once and then the row's own. `initial` is what the row above could
	 * not hold; after that the person is typing, and a later change to the prop
	 * must not reach in and rewrite what they have written.
	 */
	let draft = $state(untrack(() => initial));
	let input = $state<HTMLTextAreaElement | null>(null);

	/** Open because it was tapped, or because the parent put it here open. */
	const open = $derived(byTap || opened);

	/** Whether the box is drawn at all, rather than kept back. */
	const shown = $derived(open || lone);

	// Placed already open rather than tapped: take the caret with it, and put it
	// at the end — a row opened by a spill already has the rest of the sentence
	// in it, and the next character belongs after it.
	$effect(() => {
		if (!opened) return;
		queueMicrotask(() => {
			input?.focus();
			input?.setSelectionRange(draft.length, draft.length);
		});
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
		tapped();
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

	/*
	 * The same rule the rows above follow: run out of room and the row fills
	 * up, the rest starting a fresh one under it. See doc/spill.ts.
	 */
	function oninput() {
		const over = spill(draft, LIMITS.taskText);
		if (over === null) return;

		draft = over.head;
		if (onadd(draft)) {
			tapped();
			draft = over.tail;
			queueMicrotask(() => input?.setSelectionRange(draft.length, draft.length));
		}
	}

	/**
	 * The same cut the rows above make: what is behind the caret becomes the
	 * task, and what is in front of it stays in the row to carry on being typed.
	 *
	 * A caret at the very start has nothing behind it to make a task of, so it
	 * falls back to committing the whole of what is written — which is what
	 * Enter has always done here, and matches what a task row does when its own
	 * caret is at the start.
	 */
	function onenter(field: HTMLTextAreaElement) {
		const { head, tail } = splitAt(draft, field.selectionStart, field.selectionEnd);

		if (head.trim() === '' || tail === '') {
			commit(true);
			return;
		}

		if (!onadd(head.trim())) return;

		tapped();
		draft = tail;
		// At the start of what came down with it, which is where the writing
		// stopped — the caret has not moved, only the row under it has.
		queueMicrotask(() => {
			input?.focus();
			input?.setSelectionRange(0, 0);
		});
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			onenter(event.currentTarget as HTMLTextAreaElement);
		} else if (event.key === 'Escape') {
			event.preventDefault();
			draft = '';
			byTap = false;
			onclose?.();
		} else if (event.key === 'Backspace' && draft === '') {
			/*
			 * The other half of Enter. Enter leaves a task and opens a fresh row
			 * beneath it; backspace on that row, with nothing in it left to
			 * delete, closes it again and carries the caret back to the end of
			 * the task above.
			 */
			event.preventDefault();
			byTap = false;
			onclose?.();
			onback?.();
		}
	}
</script>

<li class="row">
	<Counter {draft} {open} />

	<!--
		Tappable, because it looks it: an empty box in a 44px target beside a row
		that opens on a tap is not something to leave inert.

		Out of the accessibility tree and out of the tab order all the same — the
		ellipsis beside it is the same action with a real label, and two stops for
		one thing is worse than none.
	-->
	<button class="box" type="button" tabindex="-1" aria-hidden="true" {disabled} onclick={start}>
		<svg viewBox="0 0 {SIZE} {SIZE}" width={SIZE} height={SIZE}>
			<path d={box} class="drawn" class:ghost={!shown} class:shown />
		</svg>
	</button>

	{#if open}
		<!--
			Caps here too: a task being typed has to look like the task it becomes,
			the way a group title already does. Without it the line changes shape
			the moment it is committed.
		-->
		<textarea
			class="text caps"
			rows="1"
			lang={langOf(draft)}
			bind:this={input}
			bind:value={draft}
			aria-label={t.task.new}
			onblur={() => commit(false)}
			{oninput}
			{onkeydown}
			use:grow={draft}></textarea>
	{:else}
		<button class="text caps" type="button" onclick={start} {disabled} aria-label={t.task.add}>
			…
		</button>
	{/if}
</li>

<style>
	/* Top-aligned and padded to match, exactly as a task row is. */
	.row {
		position: relative;
		display: flex;
		align-items: flex-start;
		gap: 0.25rem;
		min-height: var(--touch);
		list-style: none;
		font-size: var(--size-task);
		/* The same column the rows above it keep. */
		padding-right: var(--corner-ink);
		/* And the same room for the box, which is out of the flow here too. */
		padding-left: calc(var(--touch) + 0.25rem);
	}

	/* The same geometry the real checkbox above it has — see TriCheckbox. */
	.box {
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		width: calc(var(--touch) * 1.3);

		display: inline-flex;
		align-items: flex-start;
		justify-content: flex-start;
		padding-left: var(--corner-ink);
		padding-top: calc(var(--corner-ink) - var(--cap-lift));
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
	 * Drawn but not shown.
	 *
	 * An empty square at the end of a list reads as one more thing to do rather
	 * than as room for one, so at the end of a list it is kept back.
	 *
	 * Its own rule rather than a change to --faint, which is a value and not a
	 * switch.
	 */
	.ghost {
		opacity: 0;
	}

	/*
	 * The two cases where it is there to see, both as faint as the words beside
	 * it: once the row is open, because that is the box the task is about to
	 * get — and on a sheet with nothing on it, because there is then no list
	 * for it to be mistaken for the end of. It is the only row there, and the
	 * only thing saying what a task on this sheet looks like.
	 */
	.shown {
		opacity: var(--faint);
	}

	.text {
		flex: 1 1 auto;
		min-width: 0;
		text-align: left;
		cursor: text;
		/* First line centred on the box beside it, as on a task row. */
		padding-top: calc((var(--touch) - 1lh) / 2);
		padding-bottom: calc((var(--touch) - 1lh) / 2);
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

	textarea.text {
		outline: none;
		resize: none;
		overflow: hidden;
		display: block;
		line-height: inherit;
	}
</style>
