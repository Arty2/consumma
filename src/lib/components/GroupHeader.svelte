<script lang="ts">
	import HandRect from './HandRect.svelte';
	import TextRule from './TextRule.svelte';
	import { langOf } from '$lib/doc/lang';
	import { LIMITS } from '$lib/doc/limits';
	import { handCross, handLine } from '$lib/draw/hand';
	import { seedFrom } from '$lib/draw/rng';
	import { drag, dragGroup } from '$lib/dnd/drag.svelte';
	import { taken, tapped } from '$lib/feel';

	type Props = {
		title: string;
		seed: string;
		collapsed: boolean;
		count: number;
		/** Whether every task in the group is done, so the group can go. */
		finished: boolean;
		/**
		 * Loose ends: assembled on read rather than stored, so there is no title
		 * to edit, nothing to delete, and no order to drag it into.
		 */
		synthetic: boolean;
		ontoggle: () => void;
		onrename: (title: string) => void;
		ondelete: () => void;
		/** Enter leaves the name and opens a task at the top of the group. */
		onaddtask: () => void;
		onreorder: (index: number) => void;
	};

	let {
		title,
		seed,
		collapsed,
		count,
		finished,
		synthetic,
		ontoggle,
		onrename,
		ondelete,
		onaddtask,
		onreorder
	}: Props = $props();

	let editing = $state(false);
	let draft = $state('');
	/** Set for the length of the pop, so the group leaves rather than vanishes. */
	let going = $state(false);

	let width = $state(0);

	const lifted = $derived(drag.isLiftedGroup(seed));

	/*
	 * Measured rather than stretched, like every other drawn line here: a rule
	 * generated once and scaled to fit comes out with an uneven weight, because a
	 * stroke under an anisotropic transform is thinner along the squashed axis.
	 */
	const perforation = $derived(
		width > 0 ? handLine(width, { seed: seedFrom(`perf${seed}`), wobble: 1.2, y: 2 }) : ''
	);
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
		if (synthetic) return;
		draft = title;
		editing = true;
	}

	function commit() {
		editing = false;
		if (draft.trim() !== title) {
			onrename(draft.trim());
			tapped();
		}
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			// Committing here rather than through blur, so the row that opens next
			// is not closed again by the blur that would follow.
			commit();
			onaddtask();
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
	const POP_MS = 180;

	function remove() {
		if (!finished) return;
		editing = false;
		taken();

		if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
			ondelete();
			return;
		}

		// The whole group goes out with it, so the pop is on the header and the
		// delete waits for it — see TaskRow, which does the same on one row.
		going = true;
		setTimeout(ondelete, POP_MS);
	}
</script>

{#if synthetic}
	<!--
		Not a heading — a perforation across the paper, between what has a heading
		and what has lost one.

		Loose ends only ever appears because two phones disagreed: a group deleted
		on one while a task was moved into it on the other. Nothing under it was put
		there on purpose, so there is nothing here to name, rename, delete, carry,
		collapse or add to — and every one of those is something a title row offers
		just by looking like one. A line offers none of them.

		Drawn like every other line on the receipt and dashed like the landing rule,
		full width across the paper rather than the width of a word. It is still
		called what it is called, for anyone who cannot see it.
	-->
	<div class="perforation" role="separator" aria-label={title}>
		<svg bind:clientWidth={width} height="5" aria-hidden="true">
			{#if width > 0}
				<path d={perforation} class="drawn drawn--dashed" />
			{/if}
		</svg>
	</div>
{:else}
	<div class="header" class:lifted class:going>
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
				use:dragGroup={{ groupId: seed, enabled: !synthetic, onDrop: onreorder }}
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

	<TextRule text={shown} {seed} />
{/if}

<style>
	/*
	 * Full bleed: the sheet's own side padding is taken back off, so the line
	 * runs to the drawn edges of the paper the way a perforation does, rather
	 * than stopping short of them like a word would.
	 */
	.perforation {
		margin: 0.7rem -1.25rem 0.9rem;
	}

	.perforation svg {
		display: block;
		width: 100%;
		height: 5px;
		overflow: visible;
	}

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

	/* Out, not away — the same swell a task leaves on. */
	.going {
		animation: pop 180ms ease-in forwards;
		pointer-events: none;
	}

	@keyframes pop {
		from {
			opacity: 1;
			scale: 1;
		}
		40% {
			opacity: 1;
			scale: 1.04;
		}
		to {
			opacity: 0;
			scale: 0.9;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.lifted {
			transform: none;
		}

		.going {
			animation: none;
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
