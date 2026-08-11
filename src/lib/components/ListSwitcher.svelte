<script lang="ts">
	import HandRect from './HandRect.svelte';
	import Modal from './Modal.svelte';
	import TextRule from './TextRule.svelte';
	import { langOf } from '$lib/doc/lang';
	import { handChevron, handLine } from '$lib/draw/hand';
	import { seedFrom } from '$lib/draw/rng';
	import { tapped } from '$lib/feel';
	import { sheet } from '$lib/state/doc.svelte';
	import { nameFor, type ListEntry } from '$lib/state/lists';
	import { lists } from '$lib/state/lists.svelte';
	import { sync } from '$lib/state/sync.svelte';

	/*
	 * Two homes for the same control: above the sheet, where it only ever
	 * appears once there is a second list to choose between, and inside the
	 * Menu, where it stands in for the button that used to make that second
	 * list — so it has to be there even at one, or there would be nowhere
	 * left to reach a second from. `context` tells the two apart: whether it
	 * is shown at all, whether it claims the room above the corner buttons,
	 * and what its seeds are namespaced by, so two boxes drawn at once —
	 * possible in the DOM even though the sheet is never visible behind an
	 * open Menu — are never the same box.
	 */
	type Props = {
		context?: 'sheet' | 'menu';
		onafterselect?: () => void;
	};

	let { context = 'sheet', onafterselect }: Props = $props();

	let open = $state(false);
	let root: HTMLElement | undefined = $state();
	let dropdownWidth = $state(0);

	const shown = $derived(context === 'menu' ? true : lists.visible);

	const CHEVRON = 12;
	const chevron = $derived(
		handChevron(CHEVRON, !open, { seed: seedFrom(`listswitch-${context}`), wobble: 0.8 })
	);

	const activeName = $derived(nameFor(sheet.doc));
	/** Only once the active list has actually been somewhere — see §non-negotiables. */
	const activeCode = $derived(sync.code ? sync.code.slice(-4) : null);
	const label = $derived(activeCode ? `${activeName} — ${activeCode}` : activeName);

	const sorted = $derived([...lists.entries].sort((a, b) => b.lastUsedAt - a.lastUsedAt));

	/**
	 * Long enough to be a second tap, short enough not to catch two decisions.
	 * The same window every other double-tap in the app uses — it is the same
	 * finger.
	 */
	const DOUBLE_TAP_MS = 320;

	let pending: ReturnType<typeof setTimeout> | null = null;

	/** One line, drawn once and reused between every row — separators, not boxes. */
	const dividerPath = $derived(
		dropdownWidth > 0
			? handLine(dropdownWidth, { seed: seedFrom(`listsep-${context}`), wobble: 0.8, y: 2 })
			: ''
	);

	function nameOf(entry: ListEntry): string {
		return entry.id === lists.current ? activeName : lists.nameOf(entry);
	}

	function codeOf(entry: ListEntry): string | null {
		const code = entry.id === lists.current ? sync.code : lists.codeOf(entry);
		return code ? code.slice(-4) : null;
	}

	/*
	 * Held back rather than optimistic, the same choice a group title makes
	 * for the same reason: opening the dropdown is neither frequent nor
	 * urgent, so a beat of delay costs less than the popover flickering open
	 * and shut under a double tap. A second tap inside the window cancels
	 * the open and cycles the active list directly instead — the dropdown
	 * without opening it.
	 */
	function ontap() {
		if (pending) clearTimeout(pending);
		pending = setTimeout(() => {
			pending = null;
			open = !open;
		}, DOUBLE_TAP_MS);
	}

	function onsecondtap() {
		if (pending) clearTimeout(pending);
		pending = null;
		cycle();
	}

	function cycle() {
		if (sorted.length < 2) return;
		const index = sorted.findIndex((entry) => entry.id === lists.current);
		const next = sorted[(index + 1) % sorted.length];
		pick(next.id);
	}

	function pick(id: string) {
		if (id !== lists.current) {
			lists.switchTo(id);
			tapped();
		}
		open = false;
		onafterselect?.();
	}

	function onnew() {
		lists.createList();
		tapped();
		open = false;
		onafterselect?.();
	}

	// A real button gets Enter for free; a plain row has to ask.
	function onrowkeydown(event: KeyboardEvent, id: string) {
		if (event.key !== 'Enter') return;
		event.preventDefault();
		pick(id);
	}

	// Outside tap or Escape closes it — only the menu's own copy, which stays
	// a small popover in flow rather than a full panel: there is nothing here
	// to hold Tab inside, and locking body scroll for one row of buttons
	// would be a much bigger door than this needs. The sheet's copy is a real
	// Modal now and answers Escape (and everything else a panel has to)
	// through the same `use:trap` every other modal shares.
	$effect(() => {
		if (!open || context !== 'menu') return;

		function onpointerdown(event: PointerEvent) {
			if (root && !root.contains(event.target as Node)) open = false;
		}
		function onkeydown(event: KeyboardEvent) {
			if (event.key === 'Escape') open = false;
		}

		document.addEventListener('pointerdown', onpointerdown);
		document.addEventListener('keydown', onkeydown);

		return () => {
			document.removeEventListener('pointerdown', onpointerdown);
			document.removeEventListener('keydown', onkeydown);
		};
	});
</script>

{#snippet divider()}
	<svg
		class="divider"
		viewBox="0 0 {dropdownWidth} 3"
		width={dropdownWidth}
		height="3"
		aria-hidden="true"
	>
		{#if dividerPath}<path d={dividerPath} class="drawn" />{/if}
	</svg>
{/snippet}

{#snippet rows()}
	<!--
		A line above every row, the first one included: the list reads as a set
		of ruled entries rather than as a heading with rules under it, and the
		topmost row needs its own line to be closed off at the top the way the
		rest are.
	-->
	{#each sorted as entry (entry.id)}
		{@render divider()}
		{@const rowName = nameOf(entry)}
		{@const rowCode = codeOf(entry)}
		<div
			class="row caps"
			role="option"
			tabindex="0"
			aria-selected={entry.id === lists.current}
			onclick={() => pick(entry.id)}
			onkeydown={(event) => onrowkeydown(event, entry.id)}
		>
			<span class="name" lang={langOf(rowName)}>{rowName}</span>
			{#if rowCode}<span class="code">{rowCode}</span>{/if}
		</div>
	{/each}

	{#if sorted.length > 0}{@render divider()}{/if}

	<button type="button" class="row new caps boxed" onclick={onnew}>
		<HandRect seed={`listrownew-${context}`} wobble={1.4} radius={3} />
		New list
	</button>
{/snippet}

{#if shown}
	<div class="wrap {context}" bind:this={root}>
		<div class="switcher {context}">
			<!--
				Two spans rather than the one string the rule is measured from: the
				name is the part that may run long and the only part allowed to give,
				so the code — four characters that are the whole point of showing it —
				is never what an ellipsis eats. `lang` rides the name alone; a hex
				code has no language to declare.
			-->
			<button
				type="button"
				class="pill caps"
				aria-expanded={open}
				aria-haspopup="listbox"
				onclick={ontap}
				ondblclick={onsecondtap}
			>
				<span class="label" lang={langOf(activeName)}>{activeName}</span>
				{#if activeCode}<span class="code">— {activeCode}</span>{/if}
				<svg
					class="chevron"
					viewBox="0 0 {CHEVRON} {CHEVRON}"
					width={CHEVRON}
					height={CHEVRON}
					aria-hidden="true"
				>
					<path d={chevron} class="drawn" />
				</svg>
			</button>
			<!--
				Centred in the menu, where `.body` centres the pill itself — a rule
				left-aligned in a box whose contents are centred lands under nothing.
				On the sheet the pill starts at its box's left edge and the rule
				follows it there, which is what TextRule does by default.
			-->
			<TextRule text={label} seed={`listswitch-${context}`} centred={context === 'menu'} />
		</div>

		<!--
			The sheet's copy is a real Modal, the same as SYNC/SHARE/IMPORT — full
			screen, its own frame and ✕, closed by Escape or the drag-down grip —
			rather than a small popover, so a listbox lives inside it for the
			ARIA semantics the rows still want. The menu's copy stays in flow: it
			already lives inside a trapped panel, and a modal opened over a modal
			is the keyboard trap CLAUDE.md rules out.
		-->
		{#if open && context === 'sheet'}
			<Modal title="Switch list" seed={`listswitch-${context}`} onclose={() => (open = false)}>
				<div class="listbox" role="listbox" aria-label="Lists" bind:clientWidth={dropdownWidth}>
					{@render rows()}
				</div>
			</Modal>
		{:else if open}
			<div class="dropdown menu" role="listbox" aria-label="Lists" bind:clientWidth={dropdownWidth}>
				{@render rows()}
			</div>
		{/if}
	</div>
{/if}

<style>
	/*
	 * The flex item that lives in the corner row (sheet) or flows at the top
	 * of the panel (menu).
	 */
	.wrap.sheet {
		margin-inline: 0.4rem;
		min-width: 0;
	}

	/*
	 * The whole pill, label and rule together, a line width up from where it
	 * sits in flow — paint only, so the row's layout height is untouched and
	 * nothing below opens from the wrong place.
	 */
	.switcher.sheet {
		translate: 0 -5px;
	}

	/*
	 * Bold on the pill rather than on the name alone, so the code beside it is
	 * set the same way — the two are one label, read as one thing. It reads
	 * closer to the stroke weight of the icons it sits beside in the corner
	 * row; Graphe's regular weight is thin next to a 1.4px drawn stroke.
	 * Synthetic bold, since the face has only the one weight, and the hand is
	 * still the only face on the page.
	 */
	.pill {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		min-width: 0;
		min-height: var(--touch);
		font-family: var(--hand);
		font-size: var(--size-small);
		font-weight: 700;
	}

	/* Four characters, and never the ones that go — see the markup above. */
	.pill .code {
		flex: none;
	}

	/*
	 * A block-level child doesn't inherit a flex parent's shrunk box just
	 * because the parent shrank — `.wrap.sheet` narrows via flex-shrink, but
	 * without this the pill still sizes to its own content and overflows past
	 * it. The menu's pill is centred in a wide, unconstrained column and
	 * never needs to shrink, so this stays scoped to the sheet.
	 */
	.wrap.sheet .pill {
		width: 100%;
	}

	/*
	 * The one part of the pill that gives. `min-width: 0` is what lets a flex
	 * item shrink below its own text's width in the first place; everything
	 * beside it is `flex: none`, so the name is what an ellipsis takes.
	 */
	.label {
		flex: 0 1 auto;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
	}

	.chevron {
		flex: none;
		translate: 0 calc(-1 * var(--cap-lift));
	}

	/*
	 * The menu's own copy sticks where the ✕ sits rather than scrolling away
	 * with the rest of the panel — the same row the burger's own position
	 * answers to (see Menu.svelte). `margin-top` puts it at that offset
	 * already, so it is never seen "engaging" stickiness — it is already
	 * there from the first paint, whether or not the panel has been scrolled.
	 * A solid ground stops scrolled text from showing through it.
	 *
	 * It spans the panel rather than stopping short of the ✕, so its ground
	 * covers the whole row it sticks to — an inset box left scrolled text
	 * showing through beside it. The pill inside is what keeps clear of the
	 * mark; see below.
	 */
	.switcher.menu {
		position: sticky;
		top: var(--tear);
		margin-top: var(--tear);
		margin-bottom: 1.5rem;
		z-index: 1;
		background: var(--paper);
		/* One number, two users — the pill and the rule under it. */
		--pill-max: calc(100% - 2 * var(--touch));
	}

	/*
	 * The rule is measured off the label's own text, but the box it is measured
	 * in is what caps that measurement — TextRule's hidden copy is `max-width:
	 * 100%`, so left to the full panel a long name reported the panel's width
	 * and the rule ran a touch target past the pill at each end. A pen
	 * underlines the word, not the row.
	 */
	.switcher.menu :global(.ruled) {
		max-width: var(--pill-max);
		margin-inline: auto;
	}

	/*
	 * Centred on the panel, and never wide enough to reach the ✕.
	 *
	 * `.body` centres the pill for us — it is an inline-flex box in a block
	 * that sets `text-align: center` — but an inline-flex box sizes to its own
	 * content however little room is left, so a long enough name ran straight
	 * under the mark. A touch target's width held back at each end keeps it
	 * clear symmetrically, which is also what lets it stay centred on the same
	 * middle as everything else in the panel: taking the room off one side
	 * only would put the pill, and the rule under it, half a ✕ left of centre.
	 */
	.switcher.menu .pill {
		max-width: var(--pill-max);
	}

	/*
	 * The rows, wherever they live: inside the sheet's Modal, sized by the
	 * modal's own `.body` (max-width 34rem, centred, the same column every
	 * other modal writes in), or in flow in the menu, full width of the
	 * panel — see the sticky pill above. Left-aligned in both: a row is read
	 * the way every other line in this app is, not centred like the menu's
	 * own prose around it.
	 */
	.listbox {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.dropdown.menu {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding-top: 0.5rem;
		background: var(--paper);
		width: 100%;
	}

	/*
	 * Shorter than --touch: a row here is read and tapped once, not held, and
	 * a column of full touch-height rows read as a second menu rather than a
	 * short list. `.row.new` matches it below, overriding the `.boxed` floor
	 * it would otherwise inherit, so the drawn button reads as one more row
	 * rather than a taller thing bolted on the end.
	 */
	.row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		width: 100%;
		min-height: 2.25rem;
		text-align: left;
		cursor: pointer;
	}

	/*
	 * The name is what may run long, so it is the one that gives — the code
	 * is four characters and stays whole. `min-width: 0` is what lets a flex
	 * item shrink below its text's own width in the first place; without it
	 * a long name overflowed the row (and the container the divider below
	 * measures itself against, leaving the drawn line narrower than the row
	 * it was supposed to rule off).
	 */
	.row .name {
		flex: 1 1 auto;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.row .code {
		flex: none;
	}

	/*
	 * On the middle of the row, rather than on the middle of its own line box.
	 *
	 * Graphe's capitals ride high in their line box, so a row centred by the
	 * flexbox puts the letters above its middle — the same fact every drawn
	 * mark beside capitals corrects for by lifting, seen from the other side
	 * and so corrected the other way. Only the rows that are read: `.row.new`
	 * is a boxed button, and `.boxed`'s own drawn rectangle already lifts to
	 * sit on the words, so moving the words would part the two.
	 */
	.row:not(.new) > span {
		translate: 0 var(--cap-lift);
	}

	/*
	 * Ink, not faint. It is the one thing here that makes something rather
	 * than choosing between things already made, and a drawn box around dimmed
	 * words read as a button that was not available yet.
	 *
	 * Set apart from the rows above by more room than they keep between
	 * themselves, so it reads as the end of the list rather than one more
	 * entry in it.
	 */
	.row.new {
		justify-content: center;
		min-height: 2.25rem;
		margin-top: 0.75rem;
	}

	.divider {
		display: block;
		width: 100%;
		height: 3px;
		overflow: visible;
	}
</style>
