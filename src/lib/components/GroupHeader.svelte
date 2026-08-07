<script lang="ts">
	import HandRect from './HandRect.svelte';
	import TextRule from './TextRule.svelte';
	import { langOf } from '$lib/doc/lang';
	import { LIMITS } from '$lib/doc/limits';
	import { handCross } from '$lib/draw/hand';
	import { seedFrom } from '$lib/draw/rng';
	import { drag, dragGroup } from '$lib/dnd/drag.svelte';

	type Props = {
		title: string;
		seed: string;
		collapsed: boolean;
		count: number;
		/** Whether every task in the group is done, so the group can go. */
		finished: boolean;
		/** Loose ends is assembled on read, so it has no title to edit. */
		editable: boolean;
		ontoggle: () => void;
		onrename: (title: string) => void;
		ondelete: () => void;
		onreorder: (index: number) => void;
	};

	let {
		title,
		seed,
		collapsed,
		count,
		finished,
		editable,
		ontoggle,
		onrename,
		ondelete,
		onreorder
	}: Props = $props();

	let editing = $state(false);
	let draft = $state('');

	const lifted = $derived(drag.isLiftedGroup(seed));
	const cross = $derived(handCross(20, { seed: seedFrom(`del${seed}`), wobble: 0.8 }));

	/** What the rule is drawn under: the title, or the title being typed. */
	const shown = $derived(editing ? draft : title === '' ? '…' : title);

	/*
	 * Three controls on one row, and each does one thing.
	 *
	 * The title is the name, so tapping it edits the name. Collapsing is the
	 * icon's job and nothing else's — the two used to share the title, which
	 * meant every rename began with a double tap and every collapse risked one.
	 *
	 * A long press on the title picks the group up instead, the way it picks a
	 * task up.
	 */
	function startEditing() {
		if (!editable) return;
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

	/*
	 * Removing a group takes its tasks with it, so it is offered only once there
	 * is nothing in it anyone is still waiting on. An empty group counts as
	 * finished — there is nothing to lose.
	 */
	function remove() {
		if (!finished) return;
		editing = false;
		ondelete();
	}
</script>

<div class="header" class:lifted>
	{#if lifted}
		<!-- No shadow is available, so the lift is a dashed outline and a tilt. -->
		<HandRect seed={`liftgroup${seed}`} dashed wobble={1.2} />
	{/if}

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

		<!--
			While the name is being edited, the icon's place is taken by the way to
			get rid of the group. It is the same 44px square, so nothing moves.
		-->
		<button
			class="icon"
			class:nothing={!finished}
			type="button"
			disabled={!finished}
			onclick={remove}
			onmousedown={(event) => event.preventDefault()}
			aria-label={finished ? 'Delete group' : 'Delete group — finish its tasks first'}
			title={finished ? 'Delete group' : 'Finish its tasks first'}
		>
			<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
				<path d={cross} class="drawn" />
			</svg>
		</button>
	{:else}
		<!--
			The name, and the way to change it. A long press picks the group up
			instead — the same gesture that lifts a task, on the same kind of row.
		-->
		<button
			class="title caps"
			class:untitled={title === ''}
			type="button"
			lang={langOf(title)}
			aria-label={title === '' ? 'Untitled group' : title}
			onclick={startEditing}
			onkeydown={(event) => event.key === 'F2' && startEditing()}
			use:dragGroup={{ groupId: seed, enabled: editable, onDrop: onreorder }}
		>
			{title === '' ? '…' : title}
		</button>

		<!--
			Collapsed it reads [3] — what is hidden, and how much. Expanded it reads
			[…], the same ellipsis an untitled group and the add row use for "there
			is more here".

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
		position: relative;
		display: flex;
		align-items: center;
		gap: 0.25rem;
		min-height: var(--touch);
	}

	.lifted {
		transform: rotate(1.5deg);
	}

	@media (prefers-reduced-motion: reduce) {
		.lifted {
			transform: none;
		}
	}

	.title {
		flex: 1 1 auto;
		min-width: 0;
		font-family: var(--hand);
		font-size: var(--size-title);
		text-align: left;
		overflow-wrap: anywhere;
		/* The drag owns vertical movement here, as it does on a task row. */
		touch-action: pan-x;
		user-select: none;
		-webkit-user-select: none;
	}

	/*
	 * Typing a title should look like the title it becomes: same face, same
	 * size, same caps. The uppercase is CSS only, so the value keeps whatever
	 * casing was typed and the markdown export does too.
	 */
	input.title {
		outline: none;
		cursor: text;
		user-select: text;
		-webkit-user-select: text;
	}

	.untitled {
		opacity: var(--faint);
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

	/* Drawn, but not offered: the group still has something in it to do. */
	.icon.nothing {
		opacity: var(--faint);
		cursor: default;
	}
</style>
