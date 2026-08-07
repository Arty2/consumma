<script lang="ts">
	import TextRule from './TextRule.svelte';
	import { langOf } from '$lib/doc/lang';
	import { LIMITS } from '$lib/doc/limits';
	import { handChevron } from '$lib/draw/hand';
	import { seedFrom } from '$lib/draw/rng';

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

	const chevron = $derived(handChevron(20, collapsed, { seed: seedFrom(seed), wobble: 0.8 }));
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
		<span class="icon" aria-hidden="true">
			<svg viewBox="0 0 20 20" width="20" height="20">
				<path d={chevron} class="drawn" />
			</svg>
		</span>
	{/if}
</div>

<!-- Drawn rather than a border, and only as wide as the title. -->
<TextRule text={shown} {seed} />

{#if collapsed}
	<p class="collapsed">[ … {count} ]</p>
{/if}

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
		flex: 0 0 var(--touch);
		width: var(--touch);
		height: var(--touch);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		/* Level with the title's capitals, not with their line box. */
		position: relative;
		top: calc(-1 * var(--cap-lift));
	}

	.collapsed {
		margin: 0.25rem 0 0 var(--touch);
		opacity: 0.6;
	}
</style>
