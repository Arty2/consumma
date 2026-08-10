<script lang="ts">
	import { untrack } from 'svelte';
	import '../app.css';
	import { theme } from '$lib/state/theme.svelte';

	let { children } = $props();

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
