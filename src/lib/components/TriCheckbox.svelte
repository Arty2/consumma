<script lang="ts">
	import type { State } from '$lib/doc/types';
	import { DOUBLE_TAP_MS, longPress } from '$lib/dnd/longpress';
	import { finished, tapped } from '$lib/feel';
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

		if (next === 'done') finished();
		else tapped();

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
	/*
	 * The mark is 22px in a 44px target, and the target now reaches further than
	 * the mark does — a third again across, and the whole height of the row.
	 *
	 * A checkbox is a small square in a line of words, and the words either side
	 * of it are a much bigger thing to hit. So the area it answers to takes in
	 * the start of the writing beside it: a finger going for the box and landing
	 * on the first word still ticks the task, which is what it meant. What that
	 * costs is that the first word or two cannot be tapped to open the row — the
	 * words go on for a while and the end of them is always reachable, so it is
	 * the cheaper of the two mistakes.
	 *
	 * Taken out of the flow to do it. Widening a flex item would push the words
	 * thirteen pixels right and take that much off every line on the sheet, so
	 * the box is positioned against the row instead and the row pads itself by
	 * exactly what the box used to occupy — the writing does not move by a pixel
	 * and neither does the mark.
	 *
	 * Full height rather than 44px: a task over three lines has three lines of
	 * checkbox beside it, which is what a column of anything means.
	 */
	.box {
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		width: calc(var(--touch) * 1.3);

		display: inline-flex;
		align-items: flex-start;
		justify-content: flex-start;
		/*
		 * Where the mark lands, and it has to land exactly where it landed when
		 * this was a centred 44px square: half of the difference between the
		 * target and the glyph across (which is --corner-ink), and the same down
		 * less the lift that puts it level with the capitals. Centring cannot do
		 * it any more, because the box is no longer the size the centring was
		 * measured against.
		 */
		padding-left: var(--corner-ink);
		padding-top: calc(var(--corner-ink) - var(--cap-lift));
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
	 * The one flourish a tick gets, drawn over the box and held rather than
	 * faded.
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
		animation: sparkle 350ms ease-out forwards;
	}

	/*
	 * No opacity here, deliberately: ink stays ink for the whole run rather
	 * than dissolving away. Growing past its own resting size and easing
	 * back down before it is removed (see `onanimationend` above) is what
	 * keeps the end from reading as cut off mid-motion — the scribble draws
	 * itself out and holds a beat, rather than being frozen and yanked away.
	 */
	@keyframes sparkle {
		from {
			scale: 0.5;
		}
		60% {
			scale: 1.25;
		}
		to {
			scale: 1.05;
		}
	}
</style>
