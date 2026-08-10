<script lang="ts">
	import { untrack } from 'svelte';
	import HandRect from './HandRect.svelte';
	import TriCheckbox from './TriCheckbox.svelte';
	import { amountsIn, countLabel, format, type Style } from '$lib/doc/amount';
	import { length } from '$lib/doc/clean';
	import { langOf } from '$lib/doc/lang';
	import { COUNTER_WITHIN, LIMITS } from '$lib/doc/limits';
	import { hasLink, pieces } from '$lib/doc/links';
	import { nearLimit, spill } from '$lib/doc/spill';
	import type { State, Task } from '$lib/doc/types';
	import { handCross } from '$lib/draw/hand';
	import { seedFrom } from '$lib/draw/rng';
	import { drag, dragRow, type DropTarget } from '$lib/dnd/drag.svelte';
	import { taken } from '$lib/feel';
	import { grow } from '$lib/grow';

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
		/**
		 * Enter leaves the task and opens a fresh one directly beneath it — and
		 * so does running past the row's limit, which hands the new row what
		 * would not fit.
		 */
		onsplit: (carried?: string) => void;
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
	let input = $state<HTMLTextAreaElement | null>(null);
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
	 * Whether this row has to give up being a button.
	 *
	 * Only a task naming an address does: a button cannot hold a link, and a
	 * link nobody can follow is not one. Every other row stays exactly what it
	 * was, keeps its accessible name, and keeps its place in the tab order —
	 * which is nearly every row, so nearly nothing changes.
	 */
	const linked = $derived(hasLink(task.text));

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
	const showCounter = $derived(editing && nearLimit(draft, LIMITS.taskText, COUNTER_WITHIN));
	/*
	 * The ✕ stands in the middle of the paper's own right margin, and its size
	 * is what decides how much air is left either side of it.
	 *
	 * The margin that can be seen is narrower than the padding: the drawn edge
	 * runs down the middle of its own box, so it stops short of where the
	 * padding does. Between the words and that line there is about fifteen and
	 * a half pixels, and this leaves roughly four either side of the mark. It
	 * is not larger because at fifteen the arm reached the line — and the line
	 * is drawn by a hand that wanders about as far again. Two marks touching
	 * read as one smudge, and one of them says where the paper stops.
	 *
	 * The same size as the group's ✕ above it, because they stand in one column
	 * and are one thing.
	 */
	const CROSS = 13;

	const cross = $derived(handCross(CROSS, { seed: seedFrom(`x${task.id}`), wobble: 0.7 }));

	/**
	 * Long enough to be a second tap, short enough not to catch two decisions.
	 * The same window the checkbox uses, because it is the same finger.
	 */
	const DOUBLE_TAP_MS = 320;

	/*
	 * Negative infinity, not zero: `performance.now()` counts from the page
	 * loading, so a zero would make every tap in the first third of a second
	 * after load read as the second half of a double tap.
	 */
	let lastTap = -Infinity;
	/** What to put back if the tap that just happened turns out to be the first
	 * half of a double one. Seeded once; every tap writes it before changing
	 * anything. */
	let beforeTap: State = untrack(() => task.state);

	/**
	 * A tap ticks the task off. A second tap inside the window opens it for
	 * editing instead, and puts back the state the first tap changed.
	 *
	 * Optimistic rather than delayed, exactly as the checkbox beside it is:
	 * holding every tap back to see whether another is coming would put a third
	 * of a second between a finger and every tick on the sheet, which is the
	 * one thing this app is for. So the tick happens, and the rare second tap
	 * takes it back — a flicker on the uncommon path rather than a lag on the
	 * common one.
	 */
	function ontap(event: MouseEvent) {
		// A link is its own business; tapping one goes where it says.
		if ((event.target as HTMLElement).closest('a')) return;

		const now = performance.now();
		const quick = now - lastTap < DOUBLE_TAP_MS;
		lastTap = now;

		if (quick) {
			onstate(beforeTap);
			startEditing();
			return;
		}

		beforeTap = task.state;
		onstate(task.state === 'done' ? 'todo' : 'done');
	}

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

	/*
	 * A row that has run out of room fills up and the rest starts the next one,
	 * the way a line fills up and the next word goes to the next line.
	 *
	 * It used to be `maxlength`, which on a phone is indistinguishable from the
	 * keyboard having died: the row simply stopped taking characters, in the
	 * middle of a sentence, with nothing said. Nothing is refused here and
	 * nothing is lost — the writing carries on one row down, with the caret,
	 * and the word that was being typed goes with it whole.
	 *
	 * Checked on input rather than on the key, so a paste spills by the same
	 * rule as typing does.
	 */
	function oninput() {
		const over = spill(draft, LIMITS.taskText);
		if (over === null) return;

		draft = over.head;
		commit();
		onsplit(over.tail);
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
		// The keyboard's way in, now that the words are no longer a button. The
		// same key that opens a group title for renaming.
		if (event.key === 'F2' && !editing) {
			event.preventDefault();
			startEditing();
			return;
		}

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

{#snippet marks()}
	{#if shaped}
		{#if count !== null}
			<span class="num amount">{count}</span>
		{/if}
		<span class="name">{@render written(reading.name)}</span>
		{#if cost !== null}
			<span class="num cost">{cost}</span>
		{/if}
	{:else}
		{@render written(task.text)}
	{/if}
{/snippet}

{#snippet written(text: string)}
	<!--
		The words, with any address in them shown as what it points at rather
		than as every character of how to get there. The text itself is
		untouched: this is a reading on the way to the screen, like the count
		and the price, and the export and what merge sees keep the whole URL.
	-->
	{#each pieces(text) as piece, at (at)}
		{#if piece.kind === 'link'}
			<!--
				Never an app route: `links.ts` allows three schemes and every one of
				them is absolute and off this origin, so there is nothing here for
				resolve() to resolve.
			-->
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
			<a href={piece.href} rel="noreferrer" onclick={(event) => event.stopPropagation()}>
				{piece.label}
			</a>
		{:else}
			{piece.text}
		{/if}
	{/each}
{/snippet}

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<li class="row" class:lifted class:going data-task={task.id} onkeydown={onrowkeydown}>
	{#if lifted}
		<!-- No shadow is available, so the lift is a dashed outline and a tilt. -->
		<HandRect seed={`lift${task.id}`} dashed wobble={1.2} />
	{/if}

	{#if showCounter}
		<!--
			Out in the left gutter, opposite the ✕ and out of the row's flow, so
			how much room is left never costs the words any. It was in the row,
			between the text and the edge, which shortened the line it was
			counting the moment it appeared.
		-->
		<span class="counter num" aria-live="polite">{remaining}</span>
	{/if}

	<TriCheckbox state={task.state} label={task.text} seed={task.id} onchange={onstate} />

	{#if editing}
		<!--
			A textarea, so a task that is drawn over two lines is edited over two
			lines. Tasks are still one string: `clean` turns any newline into a
			space at the boundary, and Enter never reaches the field as one.
		-->
		<textarea
			class="text caps"
			rows="1"
			lang={langOf(draft)}
			bind:this={input}
			bind:value={draft}
			onblur={commit}
			{oninput}
			{onkeydown}
			use:grow={draft}></textarea>
	{:else if linked}
		<!--
			A task that names an address is the one that cannot be a button, since
			a button cannot hold a link. It is a plain container instead, and what
			it gives up is only the keyboard's way in — which the row still has,
			on F2, and the checkbox still has for ticking. Nothing is unreachable.

			The handlers stay on the row: this element is not focusable and never
			will be, so a key handler here could not fire.
		-->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div
			class="text caps"
			class:shaped
			lang={langOf(task.text)}
			onclick={ontap}
			use:dragRow={{ taskId: task.id, groupId, onDrop: ondrop, onEnterGroup }}
		>
			{@render marks()}
		</div>
	{:else}
		<!-- Everything right of the checkbox is drag territory. -->
		<!--
			A tap here ticks the task off and two taps open it — the button is
			named for the task and does the thing the task is for.

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
			onclick={ontap}
			use:dragRow={{ taskId: task.id, groupId, onDrop: ondrop, onEnterGroup }}
		>
			{@render marks()}
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
			<svg viewBox="0 0 {CROSS} {CROSS}" width={CROSS} height={CROSS} aria-hidden="true">
				<path d={cross} class="drawn" />
			</svg>
		</button>
	{/if}
</li>

<style>
	/*
	 * Top-aligned, not centred.
	 *
	 * A task that wraps is still one task with one box, and the box belongs
	 * beside the line the task starts on — centred against the whole block it
	 * drifts down the page as the words do, until on three lines it is sitting
	 * beside the middle of a sentence with nothing to do with it.
	 *
	 * A one-line row looks exactly as it did: the box is a --touch square with
	 * its mark in the middle, and `.text` below pads its first line to the same
	 * middle, so the two agree on one line and go on agreeing on four.
	 */
	.row {
		position: relative;
		display: flex;
		font-size: var(--size-task);
		align-items: flex-start;
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
		/*
		 * The page scrolls under a finger that starts on a task.
		 *
		 * This was `pan-x`, which told the browser the one direction it may not
		 * take is the one the page scrolls in — so a drag that began on any row
		 * (which is most of the sheet) moved nothing at all. The lift does not
		 * need the declaration: it only arms after the finger has held still
		 * for the press, and by then no scroll has begun, so the non-passive
		 * `touchmove` in dnd/drag can still call preventDefault and take the
		 * gesture over. Browsers latch touch-action at the start of a gesture,
		 * which is exactly why the block has to come from the handler and not
		 * from here.
		 */
		touch-action: pan-y;
		user-select: none;
		-webkit-user-select: none;
		overflow-wrap: anywhere;
		/*
		 * The first line centred on the box beside it, whatever comes after.
		 * `1lh` is this element's own line box, so it follows --size-task and
		 * the face without being told either.
		 */
		padding-top: calc((var(--touch) - 1lh) / 2);
		padding-bottom: calc((var(--touch) - 1lh) / 2);
	}

	textarea.text {
		outline: none;
		touch-action: auto;
		user-select: text;
		-webkit-user-select: text;
		/* Sized by the grow action; never by a corner the user drags. */
		resize: none;
		overflow: hidden;
		/* A textarea is inline-block by default and sits on the text baseline. */
		display: block;
		line-height: inherit;
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

	/*
	 * The mirror of `.remove`: out in the gutter on the other side, out of the
	 * row's flow, and on the first line beside the box.
	 *
	 * In the row it was a third cell that appeared at eighty characters and
	 * took its width from the line — so the words lost room at exactly the
	 * moment there was least of it, and the count of what was left was itself
	 * the reason there was less.
	 */
	.counter {
		position: absolute;
		left: calc(-1 * var(--gutter));
		top: 0;
		width: var(--gutter);
		height: var(--touch);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		opacity: 0.55;
		font-size: var(--size-small);
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
		/*
		 * Centred on the margin that can be seen, not on the box. The drawn edge
		 * runs down the middle of a box half of --edge wide, so it stops short of
		 * where the padding does; discounting that puts equal air on both sides
		 * of the mark instead of crowding it against the line.
		 */
		padding-right: calc(var(--edge) / 2);
		/*
		 * On the first line, beside the box — a task that wraps keeps its ✕
		 * where the row starts rather than letting it slide down beside the
		 * middle of a sentence. The same reason the box is top-aligned.
		 */
		top: 0;
		width: var(--gutter);
		height: var(--touch);
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
</style>
