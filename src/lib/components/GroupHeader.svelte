<script lang="ts">
	import TextRule from './TextRule.svelte';
	import { langOf } from '$lib/doc/lang';
	import { LIMITS } from '$lib/doc/limits';

	type Props = {
		title: string;
		seed: string;
		collapsed: boolean;
		count: number;
		/** Loose ends is assembled on read, so it has no title to edit. */
		editable: boolean;
		ontoggle: () => void;
		onrename: (title: string) => void;
	};

	let { title, seed, collapsed, count, editable, ontoggle, onrename }: Props = $props();

	let editing = $state(false);
	let draft = $state('');

	/** What the rule is drawn under: the title, or the title being typed. */
	const shown = $derived(editing ? draft : title === '' ? '…' : title);

	/*
	 * Nothing is labelled. The title is the whole control: tap collapses,
	 * double-tap renames, F2 for a keyboard. There is no pencil glyph, because
	 * a glyph is a label and several of them render in colour.
	 */
	function startEditing(event: Event) {
		if (!editable) return;
		event.stopPropagation();
		draft = title;
		editing = true;
	}

	function commit() {
		editing = false;
		if (draft.trim() !== title) onrename(draft.trim());
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			(event.currentTarget as HTMLInputElement).blur();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			editing = false;
		}
	}
</script>

<div class="header">
	{#if editing}
		<!-- svelte-ignore a11y_autofocus -->
		<input
			class="title caps"
			type="text"
			lang={langOf(draft)}
			bind:value={draft}
			maxlength={LIMITS.groupTitle}
			aria-label="Group title"
			autofocus
			onblur={commit}
			{onkeydown}
		/>
	{:else}
		<!-- The whole title row is the hit area for collapsing. -->
		<button
			class="title caps"
			class:untitled={title === ''}
			type="button"
			lang={langOf(title)}
			aria-label={title === '' ? 'Untitled group' : title}
			onclick={ontoggle}
			ondblclick={startEditing}
			onkeydown={(event) => event.key === 'F2' && startEditing(event)}
		>
			{title === '' ? '…' : title}
		</button>
		<!--
			A control in its own right. Tapping the title toggles too, but the title
			is also where renaming starts, so the one thing on the row that does
			nothing else has to be tappable.

			Collapsed it reads [3] — what is hidden, and how much. Expanded it reads
			[…], which is the same ellipsis an untitled group and the add row use
			for "there is more here". The count used to be printed again on a line
			below; one place is enough.

			Graphe has no brackets and falls back for them, deliberately. Do not
			swap in characters it does have.
		-->
		<button
			class="icon"
			type="button"
			onclick={ontoggle}
			aria-expanded={!collapsed}
			aria-label={collapsed ? 'Expand group' : 'Collapse group'}
		>
			<span aria-hidden="true">{collapsed ? `[${count}]` : '[…]'}</span>
		</button>
	{/if}
</div>

<!-- Drawn rather than a border, and only as wide as the title. -->
<TextRule text={shown} {seed} />

<style>
	.header {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		min-height: var(--touch);
	}

	.title {
		flex: 1 1 auto;
		min-width: 0;
		font-family: var(--hand);
		font-size: var(--size-title);
		text-align: left;
		overflow-wrap: anywhere;
	}

	/*
	 * Typing a title should look like the title it becomes: same face, same
	 * size, same caps. The uppercase is CSS only, so the value keeps whatever
	 * casing was typed and the markdown export does too.
	 */
	input.title {
		outline: none;
		cursor: text;
	}

	.untitled {
		opacity: 0.55;
	}

	.icon {
		flex: 0 0 auto;
		min-width: var(--touch);
		height: var(--touch);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-family: var(--hand);
		font-size: var(--size-title);
	}
</style>
