<script lang="ts">
	import { CODE_LENGTH, codeFrom } from '$lib/crypto/derive';
	import { handLine } from '$lib/draw/hand';
	import { seedFrom } from '$lib/draw/rng';

	/*
	 * Twelve places to write a character into, grouped the way the code is shown
	 * above it — same face, same size, so what is typed looks like what it is
	 * being compared against.
	 *
	 * One dashed rule under the whole field said "a string goes here". Twelve
	 * short ones say how long it is and how far along you are, which is the
	 * question anyone reading a code aloud is actually asking.
	 *
	 * A real input sits over the cells, holding the value, the caret and the
	 * keyboard. It is transparent rather than hidden: hiding it would take the
	 * field off the accessibility tree and out of reach of a password manager.
	 */

	type Props = { value: string; label: string };

	let { value = $bindable(), label }: Props = $props();

	/* Twelve of these plus their gaps have to fit a 320px screen. */
	const CELL = 19;

	// One stroke per place, each seeded apart so twelve of them are not one
	// stamp repeated.
	const rules = Array.from({ length: CODE_LENGTH }, (_, i) =>
		handLine(CELL - 5, { seed: seedFrom(`cell${i}`), wobble: 0.7, y: 2 })
	);

	/**
	 * What is in each place: no spaces, and lower case because that is what the
	 * code is. Showing capitals back would put the two codes in different cases,
	 * which is the one thing sharing a face and a size was meant to avoid.
	 */
	const bare = $derived(value.replace(/\s/g, '').toLowerCase().slice(0, CODE_LENGTH));
	const cells = $derived(Array.from({ length: CODE_LENGTH }, (_, i) => bare[i] ?? ''));

	/**
	 * Pasting the whole invitation is the obvious thing to do with it, so the
	 * link is taken out and the code kept.
	 *
	 * Without this the field is worse than unhelpful: `maxlength` truncates a
	 * pasted invitation to its first fourteen characters, which is the front of
	 * the URL. The field then holds `https://consum` and JOIN sits disabled with
	 * nothing to say why.
	 */
	function onpaste(event: ClipboardEvent) {
		const text = event.clipboardData?.getData('text') ?? '';
		const code = codeFrom(text);

		if (code) {
			event.preventDefault();
			value = code;
			return;
		}

		/*
		 * No code in it at all — a link on its own, most likely. Leave the field
		 * as it was rather than let the first fourteen characters of a URL in.
		 * Anything else falls through, so half a code typed in two goes still
		 * works.
		 */
		if (/[:/]/.test(text)) event.preventDefault();
	}
</script>

<label class="field">
	<span class="sr-only">{label}</span>

	<input
		type="text"
		inputmode="text"
		autocomplete="off"
		autocapitalize="off"
		autocorrect="off"
		spellcheck="false"
		maxlength={CODE_LENGTH + 2}
		bind:value
		{onpaste}
	/>

	<span class="cells" aria-hidden="true">
		{#each cells as character, i (i)}
			<!-- A gap every four, matching how the code above is grouped. -->
			<span class="cell" class:apart={i > 0 && i % 4 === 0}>
				<span class="glyph">{character}</span>
				<svg class="under" viewBox="0 0 {CELL - 5} 5" width={CELL - 5} height="5">
					<!-- Written, and the one about to be: the rest wait their turn. -->
					<path d={rules[i]} class="drawn" class:drawn--faint={i > bare.length} />
				</svg>
			</span>
		{/each}
	</span>
</label>

<style>
	.field {
		position: relative;
		display: block;
		width: fit-content;
		margin: 0 auto;
	}

	/*
	 * Over the cells, and carrying the caret. `color: transparent` leaves the
	 * caret visible while the characters themselves are drawn by the cells
	 * underneath, which is what lets them sit in their places.
	 */
	.field input {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		font-family: var(--hand);
		font-size: var(--size-display);
		text-align: center;
		color: transparent;
		/*
		 * No caret either. It cannot line up with the places — the face is
		 * proportional and the value carries whatever spaces were typed — and a
		 * caret in the wrong place reads worse than none. The solid underline
		 * moving along says where the next character lands.
		 */
		caret-color: transparent;
		cursor: text;
		outline: none;
	}

	.cells {
		display: flex;
		align-items: flex-end;
		justify-content: center;
		gap: 1px;
		pointer-events: none;
	}

	.cell {
		display: flex;
		flex-direction: column;
		align-items: center;
		width: 19px;
	}

	/* A gap every four, so the code reads the way it is written out. */
	.apart {
		margin-left: 0.3rem;
	}

	.glyph {
		font-family: var(--hand);
		font-size: var(--size-display);
		line-height: 1.25;
		/*
		 * An empty place still holds its line. Without this the cell collapses to
		 * nothing — an empty span is zero tall, the negative margin below then
		 * swallows the underline, and the whole field measures 0px high, which
		 * takes the input over it out of reach along with everything else.
		 */
		min-height: 1.25em;
		/*
		 * Close under the character. --cap-lift is borrowed here rather than
		 * measured for this: it was set to level a drawn mark beside capitals, and
		 * the distance happens to be the one that tightens a rule under one. If
		 * the face changes, check this as well as the marks.
		 */
		margin-bottom: calc(-1 * var(--cap-lift));
	}

	.under {
		display: block;
		overflow: visible;
	}
</style>
