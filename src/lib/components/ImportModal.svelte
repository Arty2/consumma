<script lang="ts">
	import { untrack } from 'svelte';
	import HandRect from './HandRect.svelte';
	import Modal from './Modal.svelte';
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
			? 'That looks like a data file, not a list.'
			: structured === 'html'
				? 'That looks like a web page, not a list.'
				: 'That doesn’t look like a task list.'
	);

	/** What each line will become, in the notation it will be exported in. */
	function marker(state: string): string {
		return state === 'done' ? '[x]' : state === 'half' ? '[~]' : '[ ]';
	}
</script>

<Modal title="Import" seed="import" {onclose}>
	<!--
		What was read, always shown and always editable.

		Opening IMPORT reads the clipboard, so most of the time the list is
		already here and there is nothing to do but confirm it. It stays on
		screen rather than being replaced by the preview: a list arriving from
		somebody else's phone is exactly the thing you want to look at before
		it lands, and a stray line is fixed here rather than by cancelling,
		editing elsewhere and starting again.

		Firefox rejects a clipboard read outright and Safari raises a prompt, so
		this is also where a list gets pasted by hand — a first-class path
		rather than a fallback nobody maintains, and the same box either way.
	-->
	<p class="hint">
		{text === ''
			? 'Paste a list — one thing per line, or a markdown checklist.'
			: 'From your clipboard. Edit it here if anything is off.'}
	</p>

	<label>
		<span class="sr-only">Markdown to import</span>
		<textarea rows="5" bind:value={text} oninput={look}></textarea>
	</label>

	{#if !parsed}
		{#if tried && text.trim() !== ''}
			<p role="alert">{refusal}</p>
		{/if}
	{:else}
		<p class="summary">
			Add {parsed.tasks}
			{parsed.tasks === 1 ? 'task' : 'tasks'} in {groups}
			{groups === 1 ? 'group' : 'groups'}?
		</p>

		<!-- Boxed and centred, the same as every other pair of actions. -->
		<div class="choices">
			<button type="button" class="caps boxed" onclick={() => onapply(parsed!, 'replace')}>
				<HandRect seed="btnreplace" wobble={1.4} radius={3} />
				Replace All
			</button>
			<!-- Add is the default, and is what pressing IMPORT implies — rightmost. -->
			<button type="button" class="caps boxed" onclick={() => onapply(parsed!, 'add')}>
				<HandRect seed="btnadd" wobble={1.4} radius={3} />
				Add
			</button>
		</div>

		<!--
			What it will be, not what was pasted. A line without a bullet becomes a
			task, so the only honest preview is the parsed list read back in the
			notation it would be exported in.

			Written as text, never as markup: nothing in this app renders HTML.
		-->
		<!--
			Keyed by position, never by what a line says.

			A list repeats itself: two tasks reading the same thing in one group is
			an ordinary list, not a mistake, and so is a second group with the same
			name. Keyed by the text, the second of any such pair is a duplicate key
			— which Svelte throws on, taking the whole preview down with it, so a
			perfectly good list came back as though it had been refused.

			Position is the honest key here in any case. This is one parse rendered
			once: nothing reorders, nothing is identified across renders, and the
			whole block is replaced whenever the text changes.
		-->
		<div class="preview" aria-label="What will be added">
			{#each parsed.groups as group, at (at)}
				{#if group.title !== ''}
					<p class="heading">## {group.title}</p>
				{/if}
				{#each group.tasks as task, line (line)}
					<p class="line">- {marker(task.state)} {task.text}</p>
				{/each}
			{/each}
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

	/*
	 * Monospaced would be a second typeface; this is the one hand, small, in a
	 * box that scrolls rather than pushing the buttons off the panel.
	 */
	.preview {
		max-height: 40vh;
		overflow-y: auto;
		padding: 0.75rem;
		border: 2px dashed var(--ink);
	}

	.preview p {
		margin: 0;
		font-size: var(--size-body);
		line-height: 1.5;
		overflow-wrap: anywhere;
	}

	.preview .heading {
		margin-top: 0.75rem;
	}

	.preview .heading:first-child {
		margin-top: 0;
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
