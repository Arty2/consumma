<script lang="ts">
	import { untrack } from 'svelte';
	import '../app.css';
	import { handUnderlineTile } from '$lib/draw/hand';
	import { seedFrom } from '$lib/draw/rng';
	import { diagnostics } from '$lib/state/diagnostics.svelte';
	import { theme } from '$lib/state/theme.svelte';

	let { children } = $props();

	/*
	 * The mark under a link, drawn once for each colour the sheet is ever in.
	 *
	 * It has to be a repeating background rather than an inline `<svg>`, because
	 * a link is inline text that wraps and every line box wants its own
	 * underline. A background repeats per line box for nothing; a measured
	 * element would have to be re-measured on every reflow.
	 *
	 * A data URI is its own document and cannot read `--ink`, so the colour is
	 * baked and the pair is swapped with the theme below. That is one tile in
	 * two colours rather than a second palette: there is still exactly one pair
	 * of colours in the app, and this is it, written where a custom property
	 * cannot reach.
	 *
	 * Set through the CSSOM, which CSP does not govern — the policy is
	 * `style-src 'self'` with one pinned hash and no room for an attribute.
	 */
	const TILE = { width: 44, height: 6 };

	const tiles = {
		light: handUnderlineTile(TILE.width, TILE.height, '#000', {
			seed: seedFrom('underline'),
			wobble: 0.9
		}),
		dark: handUnderlineTile(TILE.width, TILE.height, '#fff', {
			seed: seedFrom('underline'),
			wobble: 0.9
		})
	};

	/*
	 * Read here rather than beside the page's other loaders, and before the
	 * effect that applies it.
	 *
	 * Effects within a component run in source order, so this one is settled
	 * before the next reads it. Loading the theme from the page instead would
	 * put the two in different components and leave the order to Svelte's, and
	 * the wrong order writes the default over a choice that static/theme.js had
	 * already resolved correctly — a white frame after hydration, which is a
	 * worse flash than the one the script exists to prevent.
	 *
	 * Untracked because it writes the state it reads, as the loaders on the
	 * page are for the same reason.
	 */
	$effect(() => {
		untrack(() => theme.load());
	});

	/*
	 * static/theme.js puts the resolved colour on the document before the first
	 * paint; this takes it over from there, for the taps and for a phone that
	 * changes its mind at dusk. On the first run it writes back the value that
	 * is already there, which costs nothing.
	 *
	 * The toolbar tint goes with it. It is the one colour in the app that is
	 * not drawn from --paper, because a meta tag cannot read a custom property.
	 */
	$effect(() => {
		const resolved = theme.resolved;
		document.documentElement.dataset.theme = resolved;

		document
			.querySelector('meta[name="theme-color"]')
			?.setAttribute('content', resolved === 'dark' ? '#000000' : '#ffffff');

		// The link underline turns over with everything else.
		document.documentElement.style.setProperty(
			'--underline',
			`url("data:image/svg+xml,${encodeURIComponent(tiles[resolved])}")`
		);
	});

	/*
	 * Debug, put where CSS can see it.
	 *
	 * The same switch that keeps the sync log also draws every box on the page,
	 * because both are the same question — what is this actually doing — asked
	 * of a phone, where there is no console to open and no inspector to reach
	 * for. See the rule it turns on in app.css.
	 *
	 * Removed rather than written `off`, which is the shape the theme beside it
	 * uses and for the same reason: the default is the absence of the attribute,
	 * so nothing has to be said to mean it.
	 */
	$effect(() => {
		if (diagnostics.enabled) document.documentElement.dataset.debug = 'on';
		else delete document.documentElement.dataset.debug;
	});
</script>

<svelte:head>
	<title>/consumma</title>
	<!--
		Served from static/ rather than imported, so it stays a URL. Vite inlines
		small assets as data: URIs, which `img-src 'self'` refuses.
	-->
	<link rel="icon" href="/favicon.svg" />
</svelte:head>

{@render children()}
