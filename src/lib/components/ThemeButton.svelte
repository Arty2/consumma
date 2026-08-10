<script lang="ts">
	import { handMoon, handSun, handSunMoon } from '$lib/draw/hand';
	import { seedFrom } from '$lib/draw/rng';
	import { theme } from '$lib/state/theme.svelte';
	import { ui } from '$lib/state/ui.svelte';

	/*
	 * Sits to the left of the burger, and is always there — unlike the sync
	 * button, which has a state where it has nothing to offer. This one always
	 * has the other two.
	 *
	 * The glyph reports what is set, not what a tap would give, which is how the
	 * button beside it reads too: a control that draws its own next state has to
	 * be tapped to find out what it is doing now.
	 *
	 * It follows `choice` rather than `resolved` for that reason. Following a
	 * dark phone and having picked dark look identical on the sheet, and the
	 * only place the difference can show is here.
	 */

	const SIZE = 22;

	// Drawn once each, so the strokes do not twitch as the state changes.
	const sun = handSun(SIZE, { seed: seedFrom('sun'), wobble: 0.7 });
	const moon = handMoon(SIZE, { seed: seedFrom('moon'), wobble: 0.7 });
	const both = handSunMoon(SIZE, { seed: seedFrom('auto'), wobble: 0.7 });

	const mark = $derived(theme.choice === 'dark' ? moon : theme.choice === 'light' ? sun : both);

	const label = $derived(
		theme.choice === 'dark'
			? 'Theme — dark'
			: theme.choice === 'light'
				? 'Theme — light'
				: 'Theme — following the phone'
	);

	/*
	 * Says what it changed to, for anyone who cannot see that it did. The sheet
	 * turning over is the whole of the feedback otherwise — there is no toast,
	 * because a message about a change that fills the screen is a message about
	 * something already said.
	 */
	function cycle() {
		const choice = theme.cycle();

		ui.announce(choice === 'system' ? 'Theme now follows the phone.' : `Theme now ${choice}.`);
	}
</script>

<button class="theme" type="button" onclick={cycle} aria-label={label} title={label}>
	<svg viewBox="0 0 {SIZE} {SIZE}" width={SIZE} height={SIZE} aria-hidden="true">
		<path d={mark} class="drawn" />
	</svg>
</button>

<style>
	.theme {
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
