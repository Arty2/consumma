<script lang="ts">
	import HandRect from './HandRect.svelte';
	import TriCheckbox from './TriCheckbox.svelte';
	import { length } from '$lib/doc/clean';
	import { langOf } from '$lib/doc/lang';
	import { COUNTER_APPEARS_AT, LIMITS } from '$lib/doc/limits';
	import type { State, Task } from '$lib/doc/types';
	import { handCross } from '$lib/draw/hand';
	import { seedFrom } from '$lib/draw/rng';
	import { drag, dragRow, type DropTarget } from '$lib/dnd/drag.svelte';

	type Props = {
		task: Task;
		groupId: string;
		onstate: (state: State) => void;
		onedit: (text: string) => void;
		ondelete: () => void;
		/** Enter leaves the task and opens a fresh one directly beneath it. */
		onsplit: () => void;
		onmove: (direction: -1 | 1) => void;
		ondrop: (target: DropTarget) => void;
		onEnterGroup: (groupId: string) => void;
	};

	let { task, groupId, onstate, onedit, ondelete, onsplit, onmove, ondrop, onEnterGroup }: Props =
		$props();

	let editing = $state(false);
	let draft = $state('');
	/** Set for the length of the pop, so the row leaves rather than vanishes. */
	let going = $state(false);

	const lifted = $derived(drag.isLifted(task.id));
	const remaining = $derived(LIMITS.taskText - length(draft));
	const showCounter = $derived(editing && length(draft) >= COUNTER_APPEARS_AT);
	const cross = $derived(handCross(18, { seed: seedFrom(`x${task.id}`), wobble: 0.7 }));

	function startEditing() {
		draft = task.text;
		editing = true;
	}

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
			editing = false;
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
			type="button"
			lang={langOf(task.text)}
			aria-label={task.text}
			onclick={startEditing}
			use:dragRow={{ taskId: task.id, groupId, onDrop: ondrop, onEnterGroup }}
		>
			{task.text}
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

	.counter {
		flex: 0 0 auto;
		opacity: 0.55;
		font-size: var(--size-small);
		font-variant-numeric: tabular-nums;
	}

	.remove {
		flex: 0 0 var(--touch);
		width: var(--touch);
		height: var(--touch);
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
</style>
