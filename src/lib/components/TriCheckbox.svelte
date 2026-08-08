<script lang="ts">
	import type { State } from '$lib/doc/types';
	import { longPress } from '$lib/dnd/longpress';
	import { handCheck, handCheckBack, handRect, handSparkle } from '$lib/draw/hand';
	import { seedFrom } from '$lib/draw/rng';

	type Props = {
		state: State;
		label: string;
		/** The task id, so this box is drawn the same way on every render. */
		seed: string;
		onchange: (state: State) => void;
	};

	/*
	 * Aliased on the way in. A local called `state` turns every `$state(...)` in
	 * this file into a store subscription, because that is what `$name` means
	 * when `name` is in scope.
	 */
	let { state: current, label, seed, onchange }: Props = $props();

	const SIZE = 22;

	const options = $derived({ seed: seedFrom(seed), wobble: 1.3 });
	const box = $derived(handRect(SIZE, SIZE, { ...options, overshoot: 2.2 }));
	const slash = $derived(handCheck(SIZE, options));
	const backslash = $derived(handCheckBack(SIZE, options));

	const checked = $derived(current === 'done' ? 'true' : current === 'half' ? 'mixed' : 'false');
	const sparkle = $derived(handSparkle(SIZE * 2, { seed: seedFrom(`spark${seed}`), wobble: 0.6 }));

	/** Long enough to be a second tap, short enough not to catch two decisions. */
	const DOUBLE_TAP_MS = 320;

	/*
	 * Negative infinity, not zero. `performance.now()` counts from the page
	 * loading, so a zero here made every tap in the first third of a second
	 * after load read as the second half of a double tap.
	 */
	let lastTap = -Infinity;
	/** Cleared by the animation ending, so the strokes are drawn once each time. */
	let celebrating = $state(false);

	/**
	 * Tap toggles to-do and done. A mistaken tick costs one tap to undo.
	 *
	 * A second tap inside the window sets half instead. The first tap's toggle
	 * has already happened by then and is simply overridden — the alternative is
	 * holding every single tap back to see whether another is coming, which puts
	 * a third of a second between a finger and every tick on the sheet.
	 */
	function toggle() {
		const now = performance.now();
		const quick = now - lastTap < DOUBLE_TAP_MS;
		lastTap = now;

		if (quick) {
			half();
			return;
		}

		const next = current === 'done' ? 'todo' : 'done';

		/*
		 * Asked here rather than hidden in CSS: `celebrating` is cleared by the
		 * animation ending, so a flourish that is merely invisible would never
		 * clear and the strokes would sit in the DOM for good.
		 */
		if (next === 'done' && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
			celebrating = true;
		}

		onchange(next);
	}

	/** Long-press sets half. Holding a half task returns it to to-do. */
	function half() {
		onchange(current === 'half' ? 'todo' : 'half');
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
	data-state={current}
	{onkeydown}
	use:longPress={{ onpress: half, ontap: toggle }}
>
	<svg viewBox="0 0 {SIZE} {SIZE}" width={SIZE} height={SIZE} aria-hidden="true">
		<path d={box} class="drawn" />
		{#if current !== 'todo'}
			<path d={slash} class="drawn" />
		{/if}
		{#if current === 'done'}
			<path d={backslash} class="drawn" />
		{/if}
	</svg>
	{#if celebrating}
		<!--
			The one flourish a tick gets: a few strokes thrown out from the box and
			gone again. Drawn like everything else — CSS only fades and grows them.
		-->
		<svg
			class="sparkle"
			viewBox="0 0 {SIZE * 2} {SIZE * 2}"
			width={SIZE * 2}
			height={SIZE * 2}
			aria-hidden="true"
			onanimationend={() => (celebrating = false)}
		>
			<path d={sparkle} class="drawn" />
		</svg>
	{/if}
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

	/*
	 * The one flourish a tick gets, drawn over the box and gone in a third of a
	 * second.
	 *
	 * Centred on the box rather than left where the flow puts it — absolute with
	 * no offsets sits where the element would have been, which is after the box
	 * and half over the words. `translate` and `scale` are separate properties,
	 * so the keyframes grow it without disturbing the centring.
	 *
	 * It must never move a row while it lasts, hence out of flow entirely.
	 */
	.sparkle {
		position: absolute;
		left: 50%;
		top: 50%;
		translate: -50% -50%;
		pointer-events: none;
		animation: sparkle 340ms ease-out forwards;
	}

	@keyframes sparkle {
		from {
			opacity: 0.9;
			scale: 0.55;
		}
		to {
			opacity: 0;
			scale: 1.15;
		}
	}
</style>
