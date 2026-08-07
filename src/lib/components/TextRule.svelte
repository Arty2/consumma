<script lang="ts">
	import { langOf } from '$lib/doc/lang';
	import { handLine } from '$lib/draw/hand';
	import { seedFrom } from '$lib/draw/rng';

	type Props = {
		/** The text the rule sits under. Its width is the rule's width. */
		text: string;
		seed: string;
		faint?: boolean;
	};

	let { text, seed, faint = false }: Props = $props();

	let width = $state(0);

	const rule = $derived(
		width > 0 ? handLine(width, { seed: seedFrom(seed), wobble: 0.8, y: 2 }) : ''
	);
</script>

<!--
	A pen underlines the word, not the column, so the rule is as wide as the
	title and no wider.

	CSS cannot ask for the width of a sibling's text, and the title has to keep
	filling its row — that row is the hit area for collapsing, and shrinking it
	to the text would shrink the target with it. So the text is set a second
	time, hidden and out of flow, purely to be measured.

	The copy has to match the visible one in every way that changes its width:
	same face and size, same caps, and the same language, because Greek drops
	the tonos in capitals and ΚΑΦΕΣ is not the width of ΚΑΦΈΣ.
-->
<div class="ruled">
	<span class="sizer caps" aria-hidden="true" lang={langOf(text)} bind:clientWidth={width}>
		{text}
	</span>

	<svg class="rule" viewBox="0 0 {width} 5" {width} height="5" aria-hidden="true">
		{#if rule}
			<path d={rule} class="drawn" class:drawn--faint={faint} />
		{/if}
	</svg>
</div>

<style>
	/* Positioned, so the hidden copy is measured against this row's width and
	   a long title wraps where the visible one does rather than running off. */
	.ruled {
		position: relative;
	}

	.sizer {
		position: absolute;
		visibility: hidden;
		pointer-events: none;
		max-width: 100%;
		font-family: var(--hand);
		font-size: var(--size-title);
	}

	/* Close under the title, the way a pen underlines a word. */
	.rule {
		display: block;
		margin-top: -0.95rem;
		overflow: visible;
	}
</style>
