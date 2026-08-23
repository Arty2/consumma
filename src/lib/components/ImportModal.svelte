<script lang="ts">
	import { untrack } from 'svelte';
	import HandRect from './HandRect.svelte';
	import Modal from './Modal.svelte';
	import { t } from '$lib/i18n';
	import { fromMarkdown, looksStructured, type Parsed } from '$lib/markdown/from';

	type Props = {
		/** Whatever the clipboard gave us, or null if it refused. */
		initial: string | null;
		onapply: (parsed: Parsed, mode: 'add' | 'replace') => void;
		onclose: () => void;
	};

	let { initial, onapply, onclose }: Props = $props();

	// The modal is mounted fresh each time it opens, so what the clipboard gave
	// us is genuinely an initial value rather than something to track.
	const clipboard = untrack(() => initial);

	let text = $state(clipboard ?? '');
	let parsed = $state<Parsed | null>(clipboard ? fromMarkdown(clipboard) : null);
	let tried = $state(clipboard !== null);

	function look() {
		tried = true;
		parsed = fromMarkdown(text);
	}

	const groups = $derived(parsed?.groups.length ?? 0);

	/*
	 * Why it was turned away, when it was. A data file and a web page both come
	 * out of a line-by-line read as a heap of punctuation, so they are refused
	 * rather than imported — and saying which it was is the difference between
	 * a rule and a shrug.
	 */
	const structured = $derived(looksStructured(text));
	const refusal = $derived(
		structured === 'json'
			? t.import.refusedJson
			: structured === 'html'
				? t.import.refusedHtml
				: t.import.refusedOther
	);
</script>

<Modal title={t.import.title} seed="import" {onclose}>
	<!--
		What was read, always shown and always editable.

		Opening IMPORT reads the clipboard, so most of the time the list is
		already here and there is nothing to do but confirm it. A list arriving
		from somebody else's phone is exactly the thing you want to look at
		before it lands, and a stray line is fixed here rather than by
		cancelling, editing elsewhere and starting again.

		This box was once shown above a second, read-only one: the parsed list
		written back out in the notation it would be exported in, on the
		grounds that a line without a bullet becomes a task and the only honest
		preview is what the parse made of it. Two boxes of nearly the same
		text, one of them editable, and the reader has to work out which is
		which. The count above the buttons says how the parse went — how many
		tasks, in how many groups — and it says it in a sentence.

		Firefox rejects a clipboard read outright and Safari raises a prompt, so
		this is also where a list gets pasted by hand — a first-class path
		rather than a fallback nobody maintains, and the same box either way.
	-->
	<p class="hint">
		{text === '' ? t.import.empty : t.import.fromClipboard}
	</p>

	<label>
		<span class="sr-only">{t.import.field}</span>
		<textarea rows="5" bind:value={text} oninput={look}></textarea>
	</label>

	{#if !parsed}
		{#if tried && text.trim() !== ''}
			<p role="alert">{refusal}</p>
		{/if}
	{:else}
		<p class="summary">{t.import.summary({ tasks: parsed.tasks, groups })}</p>

		<!-- Boxed and centred, the same as every other pair of actions. -->
		<div class="choices">
			<button type="button" class="caps boxed" onclick={() => onapply(parsed!, 'replace')}>
				<HandRect seed="btnreplace" wobble={1.4} radius={3} />
				{t.import.replaceAll}
			</button>
			<!-- Add is the default, and is what pressing IMPORT implies — rightmost. -->
			<button type="button" class="caps boxed" onclick={() => onapply(parsed!, 'add')}>
				<HandRect seed="btnadd" wobble={1.4} radius={3} />
				{t.import.add}
			</button>
		</div>
	{/if}
</Modal>

<style>
	p {
		margin: 0 0 1rem;
		line-height: 1.6;
	}

	/*
	 * The two lines that tell rather than show — see --instruction-tilt. Set at
	 * the size the menu sets its own instructions, not the body's smaller one.
	 */
	.hint,
	.summary {
		font-family: var(--hand);
		font-size: var(--size-title);
		line-height: 1.5;
		text-align: center;
		transform: rotate(var(--instruction-tilt));
		transform-origin: var(--instruction-origin);
	}

	/* Monospace: this is a paste box for raw text, not a place to write. */
	textarea {
		width: 100%;
		padding: 0.5rem;
		border: 2px dashed var(--ink);
		font-family: var(--mono);
		font-size: calc(var(--size-body) * var(--mono-scale));
		resize: vertical;
	}

	.choices {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-wrap: wrap;
		gap: 1rem;
		margin-bottom: 1.5rem;
	}
</style>
