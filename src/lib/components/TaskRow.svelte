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
		onmove: (direction: -1 | 1) => void;
		ondrop: (target: DropTarget) => void;
		onEnterGroup: (groupId: string) => void;
	};

	let { task, groupId, onstate, onedit, ondelete, onmove, ondrop, onEnterGroup }: Props = $props();

	let editing = $state(false);
	let draft = $state('');
	let focused = $state(false);

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
			(event.currentTarget as HTMLInputElement).blur();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			editing = false;
		}
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
<li
	class="row"
	class:lifted
	data-task={task.id}
	onfocusin={() => (focused = true)}
	onfocusout={() => (focused = false)}
	onmouseenter={() => (focused = true)}
	onmouseleave={() => (focused = false)}
	onkeydown={onrowkeydown}
>
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
		A done task offers its own way out. Ticking something is usually the last
		thing you do to it, so the ✕ is there the moment it is done rather than
		waiting for a hover nobody has on a phone. It still appears on focus for
		anything else, which is what keeps a keyboard able to reach it.
	-->
	{#if (focused || task.state === 'done') && !editing && !drag.dragging}
		<button class="remove" type="button" onclick={ondelete} aria-label="Delete task">
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
		align-items: center;
		gap: 0.25rem;
		min-height: var(--touch);
		list-style: none;
	}

	.lifted {
		transform: rotate(1.5deg);
	}

	@media (prefers-reduced-motion: reduce) {
		.lifted {
			transform: none;
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
