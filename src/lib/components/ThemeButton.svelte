<script lang="ts">
	import { handMoon, handSun, handSunMoon } from '$lib/draw/hand';
	import { seedFrom } from '$lib/draw/rng';
	import { tapped } from '$lib/feel';
	import { t } from '$lib/i18n';
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
			? t.theme.dark
			: theme.choice === 'light'
				? t.theme.light
				: t.theme.system
	);

	/*
	 * Says what it changed to, for anyone who cannot see that it did. The sheet
	 * turning over is the whole of the feedback otherwise — there is no toast,
	 * because a message about a change that fills the screen is a message about
	 * something already said.
	 */
	function cycle() {
		tapped();
		const choice = theme.cycle();

		/*
		 * Three sentences rather than one with the choice dropped into it. The
		 * old form interpolated a raw enum value — `Theme now dark.` — which
		 * reads only because the two vocabularies happen to coincide, and would
		 * not survive a second language at all.
		 */
		ui.announce(
			choice === 'system'
				? t.theme.nowSystem
				: choice === 'dark'
					? t.theme.nowDark
					: t.theme.nowLight
		);
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
