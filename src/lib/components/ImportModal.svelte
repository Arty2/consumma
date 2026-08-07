<script lang="ts">
	import { untrack } from 'svelte';
	import Modal from './Modal.svelte';
	import { fromMarkdown, type Parsed } from '$lib/markdown/from';

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
</script>

<Modal title="Import" seed="import" {onclose}>
	{#if !parsed}
		<!--
			Firefox rejects a clipboard read outright and Safari raises a prompt, so
			pasting by hand is a first-class path rather than a fallback nobody
			maintains.
		-->
		<p>Paste a markdown checklist.</p>

		<label>
			<span class="sr-only">Markdown to import</span>
			<textarea rows="8" bind:value={text} oninput={look}></textarea>
		</label>

		{#if tried && text.trim() !== ''}
			<p role="alert">That doesn’t look like a task list.</p>
		{/if}
	{:else}
		<p class="summary">
			Add {parsed.tasks}
			{parsed.tasks === 1 ? 'task' : 'tasks'} in {groups}
			{groups === 1 ? 'group' : 'groups'}?
		</p>

		<div class="choices">
			<!-- Add is the default, and is what pressing IMPORT implies. -->
			<button type="button" class="caps" onclick={() => onapply(parsed!, 'add')}>Add</button>
			<span aria-hidden="true">·</span>
			<button type="button" class="caps" onclick={() => onapply(parsed!, 'replace')}>
				Replace everything
			</button>
		</div>
	{/if}
</Modal>

<style>
	p {
		margin: 0 0 1rem;
		line-height: 1.6;
	}

	.summary {
		font-family: var(--hand);
		font-size: var(--size-title);
	}

	textarea {
		width: 100%;
		padding: 0.5rem;
		border: 1px dashed var(--ink);
		font-family: var(--hand);
		font-size: var(--size-body);
		resize: vertical;
	}

	.choices {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin-top: 2rem;
	}

	.choices button {
		min-height: var(--touch);
	}
</style>
