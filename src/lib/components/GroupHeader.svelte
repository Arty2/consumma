<script lang="ts">
	import HandRect from './HandRect.svelte';
	import Perforation from './Perforation.svelte';
	import TextRule from './TextRule.svelte';
	import { langOf } from '$lib/doc/lang';
	import { LIMITS } from '$lib/doc/limits';
	import { handCross } from '$lib/draw/hand';
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
		/** What the group's unfinished tasks come to, or nothing to total. */
		total: string | null;
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
		total,
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

	const lifted = $derived(drag.isLiftedGroup(seed));

	/* The same mark, the same size, as the ✕ on every done task below it. */
	const CROSS = 11;

	const cross = $derived(handCross(CROSS, { seed: seedFrom(`del${seed}`), wobble: 0.8 }));

	/** What the rule is drawn under: the title, or the title being typed. */
	const shown = $derived(editing ? draft : title === '' ? '…' : title);

	/**
	 * Long enough to be a second tap, short enough not to catch two decisions.
	 * The same window a task row and the checkbox use — it is the same finger.
	 */
	const DOUBLE_TAP_MS = 320;

	let folding: ReturnType<typeof setTimeout> | null = null;

	/*
	 * A tap folds the group, two taps open its name — the same pair a task row
	 * offers, so the sheet answers a finger the same way wherever it lands.
	 *
	 * Held back rather than optimistic, which is the opposite of what a task
	 * row does, and deliberately. A row's tap is the tick, the thing people
	 * came to do, thousands of times; a third of a second of lag on it would
	 * be the app's whole character. Folding a group is neither frequent nor
	 * urgent — and taking it back is not a tick reappearing but a whole list
	 * folding and unfolding under the thumb, which is a much worse flicker
	 * than the wait it saves.
	 *
	 * Because it waits, it can use the real `dblclick` rather than pairing two
	 * clicks by their timing, so nothing depends on them arriving as a pair.
	 *
	 * A long press on the title picks the group up instead, the way it picks a
	 * task up. The icon beside the name still folds on one tap and does nothing
	 * else, for anyone who would rather aim at it.
	 */
	function ontap() {
		if (synthetic || editing) return;

		if (folding) clearTimeout(folding);
		folding = setTimeout(() => {
			folding = null;
			ontoggle();
		}, DOUBLE_TAP_MS);
	}

	function onsecondtap() {
		if (synthetic) return;

		// The fold never happened, so there is nothing to put back.
		if (folding) clearTimeout(folding);
		folding = null;

		startEditing();
	}

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
			// The name goes back before the field does: taking a focused field out
			// of the document blurs it, and the blur commits. Escape discards.
			draft = title;
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
		just by looking like one. A line offers none of them, the total included:
		there is no group here to be the sum of.

		Drawn like every other line on the receipt and dashed like the landing rule,
		full width across the paper rather than the width of a word. It is still
		called what it is called, for anyone who cannot see it.
	-->
	<div class="perforation" role="separator" aria-label={title}>
		<Perforation {seed} />
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
		{:else}
			<!--
				The name. One tap folds the group, two open the name for changing,
				and a long press picks the group up — the same gesture that lifts a
				task, on the same kind of row.
			-->
			<button
				class="title caps"
				class:untitled={title === ''}
				type="button"
				lang={langOf(title)}
				aria-label={title === '' ? 'Untitled group' : title}
				onclick={ontap}
				ondblclick={onsecondtap}
				onkeydown={(event) => event.key === 'F2' && startEditing()}
				use:dragGroup={{ groupId: seed, enabled: !synthetic, onDrop: onreorder }}
			>
				{title === '' ? '…' : title}
			</button>
		{/if}

		<!--
			Collapsed it reads [3] — what is hidden, and how much. Expanded it reads
			[…], the same ellipsis an untitled group and the add row use for "there
			is more here".

			Beside the name rather than at the end of the row, so that the total
			below is the last thing on the line and lands in the same column as the
			prices it is the sum of.

			It follows the name whether the name is a word or a field being typed in,
			so while renaming it stands at the end of the field rather than against
			the letters. It used to give up its square to the delete; with the
			delete out in the gutter there is nothing to give up, and the header is
			three controls that each do one thing.

			Graphe has no brackets and falls back for them, deliberately. Do not
			swap in characters it does have.
		-->
		<button
			class="icon"
			type="button"
			onclick={ontoggle}
			onmousedown={(event) => editing && event.preventDefault()}
			aria-expanded={!collapsed}
			aria-label={collapsed ? 'Expand group' : 'Collapse group'}
		>
			<span aria-hidden="true">{collapsed ? `[${count}]` : '[…]'}</span>
		</button>

		<!--
			What the group still costs. Done tasks are bought and do not count; half
			ones are still on the list and count in full. It stays while the group is
			collapsed, which is when it is worth most.
		-->
		{#if total !== null}
			<span class="num total">{total}</span>
		{/if}

		{#if editing}
			<!--
				The way to get rid of the group, offered only while its name is being
				edited — and out in the gutter, in the same column as the ✕ on every
				done task below it. Deleting is one thing and it happens in one place.
			-->
			<button
				class="remove"
				class:nothing={!finished}
				type="button"
				disabled={!finished}
				onclick={remove}
				onmousedown={(event) => event.preventDefault()}
				aria-label={finished ? 'Delete group' : 'Delete group — finish its tasks first'}
				title={finished ? 'Delete group' : 'Finish its tasks first'}
			>
				<svg viewBox="0 0 {CROSS} {CROSS}" width={CROSS} height={CROSS} aria-hidden="true">
					<path d={cross} class="drawn" />
				</svg>
			</button>
		{/if}
	</div>

	<!-- Drawn rather than a border, and only as wide as the title. -->
	<TextRule text={shown} {seed} />
{/if}

<style>
	/*
	 * Full bleed: the sheet's own side padding is taken back off, so the line
	 * runs to the drawn edges of the paper the way a perforation does, rather
	 * than stopping short of them like a word would.
	 */
	.perforation {
		margin: 0.7rem calc(-1 * var(--paper-inset)) 0.9rem;
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

	/*
	 * As wide as the name and no wider, so the icon sits against it. Never
	 * narrower than a touch target, because an untitled group is one ellipsis
	 * and that still has to be tappable.
	 */
	.title {
		flex: 0 1 auto;
		min-width: var(--touch);
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
	/* Typing needs the row, so the field takes it back while it is open. */
	input.title {
		flex: 1 1 auto;
		min-width: 0;
		outline: none;
		cursor: text;
		user-select: text;
		-webkit-user-select: text;
	}

	.untitled {
		opacity: var(--faint);
	}

	/*
	 * Set at task size rather than title size: it belongs to the rows under it,
	 * not to the name beside it, and a second thing in title type would read as
	 * a second title.
	 *
	 * Pushed to the end of the row so it stands directly above the prices it is
	 * the sum of — which is the whole reason the icon moved up beside the name.
	 */
	.total {
		flex: 0 0 auto;
		margin-left: auto;
		font-size: var(--size-task);
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

	/*
	 * The same column every ✕ on the sheet stands in — see `--gutter` in
	 * app.css. Out of the row's flow, so the total keeps its place whether the
	 * name is being edited or not.
	 */
	.remove {
		position: absolute;
		right: calc(-1 * var(--gutter));
		width: var(--gutter);
		height: var(--touch);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		/*
		 * Centred on the margin that can be seen, not on the box: the paper's
		 * visible edge is --edge-face inside its padding box.
		 */
		padding-right: var(--edge-face);
	}

	/*
	 * The mark alone steps in; the button does not, so the tap area stays out
	 * in the margin — see --cross-step.
	 */
	.remove svg {
		translate: calc(-1 * var(--cross-step)) 0;
	}

	/* Drawn, but not offered: the group still has something in it to do. */
	.remove.nothing {
		opacity: var(--faint);
		cursor: default;
	}
</style>
