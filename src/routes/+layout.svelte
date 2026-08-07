<script lang="ts">
	import '../app.css';

	let { children } = $props();
</script>

<svelte:head>
	<title>Consumma</title>
	<!--
		Served from static/ rather than imported, so it stays a URL. Vite inlines
		small assets as data: URIs, which `img-src 'self'` refuses.
	-->
	<link rel="icon" href="/favicon.svg" />
</svelte:head>

{@render children()}
