<script lang="ts">
	import type { State } from '$lib/doc/types';
	import { longPress } from '$lib/dnd/longpress';
	import { handCheck, handCheckBack, handRect } from '$lib/draw/hand';
	import { seedFrom } from '$lib/draw/rng';

	type Props = {
		state: State;
		label: string;
		/** The task id, so this box is drawn the same way on every render. */
		seed: string;
		onchange: (state: State) => void;
	};

	let { state, label, seed, onchange }: Props = $props();

	const SIZE = 22;

	const options = $derived({ seed: seedFrom(seed), wobble: 1.3 });
	const box = $derived(handRect(SIZE, SIZE, { ...options, overshoot: 2.2 }));
	const slash = $derived(handCheck(SIZE, options));
	const backslash = $derived(handCheckBack(SIZE, options));

	const checked = $derived(state === 'done' ? 'true' : state === 'half' ? 'mixed' : 'false');

	/** Tap toggles to-do and done. A mistaken tick costs one tap to undo. */
	function toggle() {
		onchange(state === 'done' ? 'todo' : 'done');
	}

	/** Long-press sets half. Holding a half task returns it to to-do. */
	function half() {
		onchange(state === 'half' ? 'todo' : 'half');
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key !== ' ') return;
		event.preventDefault();
		if (event.shiftKey) half();
		else toggle();
	}
</script>

<span
	class="box"
	role="checkbox"
	aria-checked={checked}
	aria-label={label}
	tabindex="0"
	data-state={state}
	{onkeydown}
	use:longPress={{ onpress: half, ontap: toggle }}
>
	<svg viewBox="0 0 {SIZE} {SIZE}" width={SIZE} height={SIZE} aria-hidden="true">
		<path d={box} class="drawn" />
		{#if state !== 'todo'}
			<path d={slash} class="drawn" />
		{/if}
		{#if state === 'done'}
			<path d={backslash} class="drawn" />
		{/if}
	</svg>
</span>

<style>
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
		cursor: pointer;
		/* Otherwise Android raises the text-selection menu mid-press. */
		touch-action: manipulation;
		user-select: none;
		-webkit-user-select: none;
	}

	svg {
		overflow: visible;
	}
</style>
