<script lang="ts">
	import HandRect from './HandRect.svelte';
	import TriCheckbox from './TriCheckbox.svelte';
	import { amountsIn, countLabel, format, type Style } from '$lib/doc/amount';
	import { length } from '$lib/doc/clean';
	import { langOf } from '$lib/doc/lang';
	import { COUNTER_APPEARS_AT, LIMITS } from '$lib/doc/limits';
	import type { State, Task } from '$lib/doc/types';
	import { handCross } from '$lib/draw/hand';
	import { seedFrom } from '$lib/draw/rng';
	import { drag, dragRow, type DropTarget } from '$lib/dnd/drag.svelte';
	import { taken } from '$lib/feel';

	type Props = {
		task: Task;
		groupId: string;
		/** How this group writes its numbers, so this row writes them the same way. */
		style: Style | null;
		/** Asked for by the sheet: open this row's editor, caret at the end. */
		open: boolean;
		onstate: (state: State) => void;
		onedit: (text: string) => void;
		ondelete: () => void;
		/** Enter leaves the task and opens a fresh one directly beneath it. */
		onsplit: () => void;
		/** Backspace on an emptied row: it goes, and the one above opens. */
		onback: () => void;
		onopened: () => void;
		onmove: (direction: -1 | 1) => void;
		ondrop: (target: DropTarget) => void;
		onEnterGroup: (groupId: string) => void;
	};

	let {
		task,
		groupId,
		style,
		open,
		onstate,
		onedit,
		ondelete,
		onsplit,
		onback,
		onopened,
		onmove,
		ondrop,
		onEnterGroup
	}: Props = $props();

	let editing = $state(false);
	let draft = $state('');
	let input = $state<HTMLInputElement | null>(null);
	/** Set for the length of the pop, so the row leaves rather than vanishes. */
	let going = $state(false);

	const lifted = $derived(drag.isLifted(task.id));

	/*
	 * The count at the front and the price at the back, read on the way to the
	 * screen and never written down — the text is one string and stays one.
	 *
	 * A row with neither is left exactly as it was: a text node in a button.
	 * Only a row that has something of its own to set apart becomes cells, so
	 * nothing about an ordinary list moves.
	 *
	 * The count is not a column. It sits in front of the words like the word it
	 * stands in for, and a row without one starts where its words start —
	 * reserving the space on every row indented half a list to line up numbers
	 * most of it does not have.
	 */
	const reading = $derived(amountsIn(task.text));
	const shaped = $derived(reading.amount !== null || reading.cost !== null);

	/*
	 * Written out the way the group writes numbers rather than the way this line
	 * happened to be typed, so one column does not read `5,08`, `20.00` and `10`
	 * down its length. The stored text keeps every character of what was typed.
	 */
	const count = $derived(reading.count === null ? null : countLabel(reading.count, style));
	const cost = $derived(
		reading.money === null || style === null ? null : format(reading.money.cents, style)
	);
	const remaining = $derived(LIMITS.taskText - length(draft));
	const showCounter = $derived(editing && length(draft) >= COUNTER_APPEARS_AT);
	const cross = $derived(handCross(18, { seed: seedFrom(`x${task.id}`), wobble: 0.7 }));

	/*
	 * The caret goes with the tap. Without this the button is swapped for an
	 * unfocused input, which never blurs, so the row never commits and never
	 * leaves edit mode — it simply sits there showing the raw string, which
	 * looks for all the world like the count and the price being lost.
	 *
	 * At the end rather than wherever the browser leaves it: tapping a task is
	 * to add to what it says more often than to replace it, and it is what a
	 * backspace out of the row beneath expects to find.
	 */
	function startEditing() {
		draft = task.text;
		editing = true;

		queueMicrotask(() => {
			input?.focus();
			input?.setSelectionRange(draft.length, draft.length);
		});
	}

	// Asked for from outside — the row beneath was backspaced away.
	$effect(() => {
		if (!open || editing) return;
		startEditing();
		onopened();
	});

	function commit() {
		editing = false;
		const next = draft.trim();
		if (next !== '' && next !== task.text) onedit(next);
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			// Commit first: the blur handler would otherwise fire after the new row
			// is asked for and close it again.
			commit();
			onsplit();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			/*
			 * Put the text back before the field goes, because taking a focused
			 * field out of the document blurs it and the blur commits. Escape
			 * meant nothing while the field was never focused; now that it is,
			 * it has to actually discard.
			 */
			draft = task.text;
			editing = false;
		} else if (event.key === 'Backspace' && draft === '') {
			// The other half of Enter: nothing left to delete in the row, so the
			// row goes and the caret carries on at the end of the one above.
			event.preventDefault();
			editing = false;
			onback();
		}
	}

	/*
	 * A tick is the end of something, so the row goes out with a small pop
	 * rather than simply ceasing to be there. The delete waits for the animation
	 * so the row is still on the sheet while it plays; reduced motion skips
	 * straight to the deletion.
	 */
	const POP_MS = 180;

	function pop() {
		taken();

		if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
			ondelete();
			return;
		}

		going = true;
		setTimeout(ondelete, POP_MS);
	}

	function onrowkeydown(event: KeyboardEvent) {
		if (!event.altKey) return;
		if (event.key === 'ArrowUp') {
			event.preventDefault();
			onmove(-1);
		} else if (event.key === 'ArrowDown') {
			event.preventDefault();
			onmove(1);
		}
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<li class="row" class:lifted class:going data-task={task.id} onkeydown={onrowkeydown}>
	{#if lifted}
		<!-- No shadow is available, so the lift is a dashed outline and a tilt. -->
		<HandRect seed={`lift${task.id}`} dashed wobble={1.2} />
	{/if}

	<TriCheckbox state={task.state} label={task.text} seed={task.id} onchange={onstate} />

	{#if editing}
		<input
			class="text caps"
			type="text"
			lang={langOf(draft)}
			bind:this={input}
			bind:value={draft}
			maxlength={LIMITS.taskText}
			onblur={commit}
			{onkeydown}
		/>
		{#if showCounter}
			<span class="counter" aria-live="polite">{remaining}</span>
		{/if}
	{:else}
		<!-- Everything right of the checkbox is drag territory. -->
		<!--
			The label is set explicitly because Chrome folds text-transform into
			the accessible name, and a screen reader should read what was written
			rather than shouting it.
		-->
		<button
			class="text caps"
			class:shaped
			type="button"
			lang={langOf(task.text)}
			aria-label={task.text}
			onclick={startEditing}
			use:dragRow={{ taskId: task.id, groupId, onDrop: ondrop, onEnterGroup }}
		>
			{#if shaped}
				{#if count !== null}
					<span class="num amount">{count}</span>
				{/if}
				<span class="name">{reading.name}</span>
				{#if cost !== null}
					<span class="num cost">{cost}</span>
				{/if}
			{:else}
				{task.text}
			{/if}
		</button>
	{/if}

	<!--
		A done task offers its own way out, and only a done task.
		
		It used to appear on focus or hover as well, which put a live delete
		button beside every row a finger passed over — and left it sitting there
		after a task was un-ticked, because the pointer had not moved away yet.
		Removing something is for things that are finished with.
	-->
	{#if task.state === 'done' && !editing && !drag.dragging}
		<button class="remove" type="button" onclick={pop} aria-label="Delete task">
			<svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
				<path d={cross} class="drawn" />
			</svg>
		</button>
	{/if}
</li>

<style>
	.row {
		position: relative;
		display: flex;
		font-size: var(--size-task);
		align-items: center;
		gap: 0.25rem;
		min-height: var(--touch);
		list-style: none;
	}

	.lifted {
		transform: rotate(1.5deg);
	}

	/* Out, not away: a short swell and then nothing. */
	.going {
		animation: pop 180ms ease-in forwards;
		pointer-events: none;
	}

	@keyframes pop {
		from {
			opacity: 1;
			scale: 1;
		}
		40% {
			opacity: 1;
			scale: 1.04;
		}
		to {
			opacity: 0;
			scale: 0.9;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.lifted {
			transform: none;
		}

		.going {
			animation: none;
		}
	}

	.text {
		flex: 1 1 auto;
		min-width: 0;
		text-align: left;
		cursor: text;
		/* The drag owns vertical movement here; the checkbox keeps its own. */
		touch-action: pan-x;
		user-select: none;
		-webkit-user-select: none;
		overflow-wrap: anywhere;
	}

	input.text {
		outline: none;
		touch-action: auto;
		user-select: text;
		-webkit-user-select: text;
	}

	/*
	 * Three cells rather than a line of words, and only once there is something
	 * to line up. Baselines rather than boxes: the figures are set in a
	 * different face from the words beside them, and the baseline is what the
	 * two share.
	 */
	.text.shaped {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
	}

	/*
	 * `break-word` here, not the `anywhere` the plain row uses. They break the
	 * same words; the difference is that `anywhere` also shrinks the element's
	 * min-content width to one character, and a flex item sized from that gives
	 * the words a column two letters wide while the price sits in daylight.
	 */
	.name {
		flex: 1 1 auto;
		min-width: 0;
		overflow-wrap: break-word;
	}

	/* As wide as the count is, and no wider: it is a word, not a column. */
	.amount {
		flex: 0 0 auto;
	}

	/* Last in the row, so the prices end level down the right-hand edge. */
	.cost {
		flex: 0 0 auto;
	}

	.counter {
		flex: 0 0 auto;
		opacity: 0.55;
		font-size: var(--size-small);
		font-variant-numeric: tabular-nums;
	}

	/*
	 * Out in the sheet's own padding, and out of the row's flow.
	 *
	 * At the end of the row it took its width from the line, which shortened the
	 * price column on exactly the rows that were done — the column stopped being
	 * a column the moment anything was ticked. Here nothing moves when it
	 * appears, and it stands in the same place as the group's ✕ above it.
	 *
	 * It ends short of the page's own padding, so it never pushes the sheet
	 * sideways, and it starts at the row's edge, so it never covers the price
	 * beside it — tapping a price still opens the row.
	 */
	.remove {
		position: absolute;
		right: calc(-1 * var(--gutter));
		width: var(--gutter);
		height: var(--touch);
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
</style>
