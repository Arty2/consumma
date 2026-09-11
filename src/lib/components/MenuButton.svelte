<script lang="ts">
	import { handBurger } from '$lib/draw/hand';
	import { seedFrom } from '$lib/draw/rng';
	import { longPress } from '$lib/dnd/longpress';
	import { tapped } from '$lib/feel';
	import { t } from '$lib/i18n';

	/*
	 * Three strokes, and nothing else. What is waiting to be synced is said by
	 * the button beside it — a menu that changed shape to report sync state was
	 * two jobs on one control, and neither read clearly.
	 */

	type Props = {
		onopen: () => void;
		/**
		 * Held rather than tapped: the debug switch, which is not on the panel
		 * until it is on.
		 */
		ondebug: () => void;
	};

	let { onopen, ondebug }: Props = $props();

	/**
	 * Set by the press and eaten by the click that follows it, the same swallow
	 * a drop uses: without it the menu opens over the thing the press just did.
	 */
	let pressed = false;

	function press() {
		pressed = true;
		ondebug();
	}

	function open() {
		if (pressed) {
			pressed = false;
			return;
		}

		tapped();
		onopen();
	}

	const SIZE = 22;

	// Drawn once, never re-seeded.
	const burger = handBurger(SIZE, { seed: seedFrom('burger'), wobble: 0.7 });
</script>

<!--
	A tap opens the menu; a press turns the debug switch on and off.

	The switch is not a thing the app has — it is a tool for whoever is building
	it — so it is not on the panel at all until it is on, and this is how it gets
	there. The burger is where it belongs: the switch lives in the menu, and this
	is the menu. `longPress` buzzes on the threshold itself, which is the whole
	of what says the press landed, since the panel is not open to show it.
-->
<button
	class="menu-button"
	type="button"
	onclick={open}
	use:longPress={{ onpress: press }}
	aria-label={t.menu.label}
	title={t.menu.label}
	data-guide="burger"
>
	<svg viewBox="0 0 {SIZE} {SIZE}" width={SIZE} height={SIZE} aria-hidden="true">
		<path d={burger} class="drawn" />
	</svg>
</button>

<style>
	.menu-button {
		width: var(--touch);
		height: var(--touch);
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	svg {
		overflow: visible;
	}
</style>
