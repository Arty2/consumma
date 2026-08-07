<script lang="ts">
	import { LIMITS } from '$lib/doc/limits';
	import { handChevron, handLine } from '$lib/draw/hand';
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
	let ruleWidth = $state(0);

	const options = $derived({ seed: seedFrom(seed), wobble: 0.8 });
	const chevron = $derived(handChevron(20, collapsed, options));
	const rule = $derived(ruleWidth > 0 ? handLine(ruleWidth, { ...options, y: 2 }) : '');

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

<!-- The rule under the title, drawn rather than a border. -->
<svg class="rule" bind:clientWidth={ruleWidth} aria-hidden="true">
	{#if rule}
		<path d={rule} class="drawn" />
	{/if}
</svg>

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
		font-family: var(--display);
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
	}

	/* Close under the title, the way a pen underlines a word. */
	.rule {
		display: block;
		width: 45%;
		min-width: 6rem;
		height: 5px;
		margin-top: -0.5rem;
		overflow: visible;
	}

	.collapsed {
		margin: 0.25rem 0 0 var(--touch);
		opacity: 0.6;
	}
</style>
