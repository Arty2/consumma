<script lang="ts">
	import HandRect from './HandRect.svelte';
	import Modal from './Modal.svelte';
	import TextRule from './TextRule.svelte';
	import { langOf } from '$lib/doc/lang';
	import { handChevron, handLine } from '$lib/draw/hand';
	import { seedFrom } from '$lib/draw/rng';
	import { drag, NEW_LIST } from '$lib/dnd/drag.svelte';
	import { DOUBLE_TAP_MS } from '$lib/dnd/longpress';
	import { tapped } from '$lib/feel';
	import { t } from '$lib/i18n';
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

	/*
	 * A group is in hand, and this is where it can be put down.
	 *
	 * The pill is drawn as a drop target — a dashed box round it, which is what
	 * a dashed box means everywhere else here — and it is on the page for that
	 * even where there is only one list, or the way to make a second one by
	 * carrying a group there would be missing from exactly the device that has
	 * never had one. The theme and the burger leave at the same moment (see
	 * +page.svelte), so the corner is being redrawn anyway.
	 *
	 * Not while a sync is in flight: a list minted then could not be written to
	 * safely, `lists.adopt()` refuses, and a control that is not going to answer
	 * is better not offered.
	 */
	const carrying = $derived(context === 'sheet' && drag.groupId !== null && !sync.busy);

	/**
	 * And the lists themselves, which are only shown once the group reaches the
	 * pill.
	 *
	 * A column standing open for the whole of a drag is a column lying across
	 * the sheet the group is being carried over: it covers the titles a drop
	 * between two groups is aimed at, and it answers the hit test before they
	 * do. So the switcher opens the way a finger opens anything — by arriving
	 * — and closes again the moment the group is taken back to the list.
	 */
	const unfolded = $derived(carrying && drag.overSwitcher);

	const shown = $derived(context === 'menu' ? true : lists.visible || carrying);

	const CHEVRON = 12;
	const chevron = $derived(
		handChevron(CHEVRON, !open, { seed: seedFrom(`listswitch-${context}`), wobble: 0.8 })
	);

	const activeName = $derived(nameFor(sheet.doc));
	/** Only once the active list has actually been somewhere — see §non-negotiables. */
	const activeCode = $derived(sync.code ? sync.code.slice(-4) : null);
	/**
	 * What the rule under the pill is measured from, so it has to read as the
	 * pill reads: the two are set in separate spans with a gap between them
	 * (see the markup), and a plain space is what stands in for that gap here.
	 */
	const label = $derived(activeCode ? `${activeName} ${activeCode}` : activeName);

	const sorted = $derived([...lists.entries].sort((a, b) => b.lastUsedAt - a.lastUsedAt));

	let pending: ReturnType<typeof setTimeout> | null = null;

	/** One line, drawn once and reused between every row — separators, not boxes. */
	const dividerPath = $derived(
		dropdownWidth > 0
			? handLine(dropdownWidth, { seed: seedFrom(`listsep-${context}`), wobble: 0.8, y: 2 })
			: ''
	);

	/*
	 * Every list but the one the group is already on. That one is not a place
	 * it can go, and a row that answers nothing in the middle of the column is
	 * a dead spot under a finger.
	 */
	const elsewhere = $derived(sorted.filter((entry) => entry.id !== lists.current));

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

{#snippet dropRows()}
	<!--
		The same rows the dropdown shows, read rather than tapped: no role, no
		handlers, and the whole column hidden from a screen reader, because there
		is no way to reach it but by carrying something. What marks the one under
		the finger is a dashed box, which is what the pill itself is wearing —
		here it means the same thing it means there.
	-->
	{#each elsewhere as entry (entry.id)}
		{@render divider()}
		{@const rowName = nameOf(entry)}
		{@const rowCode = codeOf(entry)}
		<div class="row drop caps" data-list={entry.id}>
			{#if drag.isListLanding(entry.id)}
				<HandRect seed={`listdrop-${entry.id}`} dashed wobble={1.2} radius={3} />
			{/if}
			<span class="name" lang={langOf(rowName)}>{rowName}</span>
			<span class="code">{rowCode ?? '¢'}</span>
		</div>
	{/each}

	{#if elsewhere.length > 0}{@render divider()}{/if}

	<div class="row drop new caps boxed" data-newlist>
		<HandRect
			seed="listrownew-carry"
			wobble={1.4}
			radius={3}
			dashed={drag.isListLanding(NEW_LIST)}
		/>
		{t.lists.new}
	</div>
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
			<!--
				A code once it has one; until then a mark saying it hasn't, rather
				than leaving the slot blank — a row with nothing there read as
				unfinished rather than as a list that has simply never left this
				device.
			-->
			<span class="code" aria-label={rowCode === null ? t.lists.localOnly : rowCode}
				>{rowCode ?? '¢'}</span
			>
		</div>
	{/each}

	{#if sorted.length > 0}{@render divider()}{/if}

	<button type="button" class="row new caps boxed" onclick={onnew}>
		<HandRect seed={`listrownew-${context}`} wobble={1.4} radius={3} />
		{t.lists.new}
	</button>
{/snippet}

{#if shown}
	<div class="wrap {context}" bind:this={root} data-switcher={context === 'sheet' ? '' : undefined}>
		<div class="switcher {context}">
			<!--
				A dashed box round the switcher while a group is in hand: this is
				somewhere it can be put down. It encloses the pill and the rule under
				it, because those two are the switcher — the rule is the pill's own
				underline and a box drawn between them would part them.
			-->
			{#if carrying}
				<HandRect seed="listdroptarget" dashed wobble={1.4} radius={4} />
			{/if}

			<!--
				Two spans rather than the one string the rule is measured from: the
				name is the part that may run long and the only part allowed to give,
				so the code — four characters that are the whole point of showing it —
				is never what an ellipsis eats. `lang` rides the name alone; a hex
				code has no language to declare.

				Called `tail` rather than `code`: Menu.svelte shows the whole code
				in a `<p class="code">` of its own, and a second `.code` on the
				same panel makes every `page.locator('.code')` in the suite match
				two elements — which is exactly how six tests came to fail at once.
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
				{#if activeCode}<span class="tail">{activeCode}</span>{/if}
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
				Left in both homes, which is what TextRule does by default: the pill
				starts at its box's left edge and the rule follows it there.
			-->
			<TextRule text={label} seed={`listswitch-${context}`} />
		</div>

		<!--
			Where a carried group can be let go: one row per list it could go to,
			and one that makes a list on the spot — the same pair of offers the
			sheet already makes a task one level down, where a row can be dropped
			into a group or onto the row that invents one.

			Out of flow, over the writing rather than pushing it: a column that
			opened in the flow would move the list under the finger, and the finger
			is steering by what it can see. Aria-hidden because there is no way to
			reach it but by carrying something — the same as every landing rule on
			the sheet.
		-->
		{#if unfolded}
			<!--
				`data-switcher` again, and not only on the wrap above: what the hit
				test gets back is the boxes under the point rather than the chain of
				elements around it, so a column hanging below the pill is not the
				pill's ancestor as far as it is concerned. Without this, crossing
				from the pill into a gap between two rows read as leaving the
				switcher, and the column shut under the finger on its way to a list.
			-->
			<div class="dropdown carry" data-switcher bind:clientWidth={dropdownWidth} aria-hidden="true">
				{@render dropRows()}
			</div>
		{/if}

		<!--
			The sheet's copy is a real Modal, the same as SYNC/SHARE/IMPORT — full
			screen, its own frame and ✕, closed by Escape or the drag-down grip —
			rather than a small popover, so a listbox lives inside it for the
			ARIA semantics the rows still want. The menu's copy stays in flow: it
			already lives inside a trapped panel, and a modal opened over a modal
			is the keyboard trap CLAUDE.md rules out.
		-->
		{#if open && context === 'sheet'}
			<Modal title={t.lists.switch} seed={`listswitch-${context}`} onclose={() => (open = false)}>
				<div
					class="listbox"
					role="listbox"
					aria-label={t.lists.label}
					bind:clientWidth={dropdownWidth}
				>
					{@render rows()}
				</div>
			</Modal>
		{:else if open}
			<div
				class="dropdown menu"
				role="listbox"
				aria-label={t.lists.label}
				bind:clientWidth={dropdownWidth}
			>
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
		position: relative;
		margin-inline: 0.4rem;
		min-width: 0;
	}

	/*
	 * The whole pill, label and rule together, a line width up from where it
	 * sits in flow — paint only, so the row's layout height is untouched and
	 * nothing below opens from the wrong place.
	 */
	.switcher.sheet {
		position: relative;
		translate: 0 -5px;
	}

	/*
	 * The drop target's box, drawn a few pixels out from the switcher rather
	 * than around its exact bounds.
	 *
	 * HandRect fills whatever it is in, and what this one is in is the pill and
	 * the rule under it — so flush, its bottom stroke lay along the rule and it
	 * read as one more line under the words rather than as a box round them. A
	 * hand drawing a box round something on paper leaves room; the numbers are
	 * enough to part the two strokes and no more, and the sides stay within the
	 * margin the switcher already keeps from the sync mark beside it.
	 *
	 * Written as a size rather than as offsets, which is not a preference: an
	 * `<svg>` is a replaced element, so `width: auto` resolves to its own
	 * intrinsic 300 × 150 and `inset` is ignored — the box came out the size of
	 * a postcard laid across the top of the sheet. The same trap `SideEdge`
	 * documents at the other end of the paper.
	 */
	.switcher.sheet :global(svg.rect) {
		top: -5px;
		left: -6px;
		width: calc(100% + 12px);
		height: calc(100% + 9px);
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
	.pill .tail {
		flex: none;
	}

	/*
	 * TextRule measures a hidden copy of the words to find how wide to draw,
	 * and sets that copy in `--size-title` — which is what a group title is
	 * set in, and what every other caller of it is. This pill is `--size-small`
	 * and bold, so left alone the copy measured half again too wide and the
	 * rule ran well past the end of the words. The copy has to be set the way
	 * the words it stands for are.
	 */
	.switcher :global(.sizer) {
		font-size: var(--size-small);
		font-weight: 700;
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
	 * The menu's own copy opens on the row the ✕ sits on — the same row the
	 * burger answers to, on the other face of the paper — and then scrolls away
	 * with everything else written on the panel.
	 *
	 * It was pinned there for a while, on the reasoning that it answers which
	 * list this is and so should always be legible. What that bought was an
	 * opaque band the width of the paper, sliding under the writing and cutting
	 * whichever line it met in half. The panel is a sheet of paper: one thing
	 * is written on it and all of it moves together. The ✕ is the only thing
	 * that stays, because it is a control rather than something written.
	 */
	.switcher.menu {
		/*
		 * Level with the ✕ across the panel from it, which is the whole of why
		 * this number exists.
		 *
		 * The scroller already begins a tear's depth inside the paper, so being
		 * flush with the top of it put the pill `--corner-lead` above the ✕ —
		 * near enough to read as one row and far enough out to read as a
		 * mistake in it. `--corner-y` is `--paper-top + --tear + --corner-lead`
		 * and the scroller's own top is the first two of those, so the lead is
		 * exactly what is missing. Both boxes are `--touch` tall, so levelling
		 * their tops levels their middles. The ✕ does not move: it is placed
		 * where every corner control in the app is placed.
		 */
		margin-top: var(--corner-lead);
		margin-bottom: 1.5rem;
		/*
		 * Left, against the panel's own centred prose. It answers which list
		 * this is, and it is read the way the rows it opens are — which are
		 * left too, as every line of writing in this app is.
		 */
		text-align: left;
		/*
		 * One number, two users — the pill and the rule under it. A touch
		 * target held back on the right alone, because that is the side the ✕
		 * is on and the pill now starts hard against the left.
		 */
		--pill-max: calc(100% - var(--touch));
	}

	/*
	 * The rule is measured off the label's own text, but the box it is measured
	 * in is what caps that measurement — TextRule's hidden copy is `max-width:
	 * 100%`, so left to the full panel a long name reported the panel's width
	 * and the rule ran a touch target past the pill. A pen underlines the
	 * word, not the row.
	 */
	.switcher.menu :global(.ruled) {
		max-width: var(--pill-max);
	}

	/*
	 * Never wide enough to reach the ✕ it shares a row with. An inline-flex
	 * box sizes to its own content however little room is left, so without
	 * this a long enough name ran straight under the mark.
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

	/*
	 * Both columns of rows: the one the menu opens on a tap, and the one a
	 * carried group opens by arriving. Same rows, same ground — a column with
	 * nothing behind it has the sheet's own writing reading through the names.
	 */
	.dropdown {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding-top: 0.5rem;
		background: var(--paper);
	}

	.dropdown.menu {
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
		user-select: none;
		-webkit-user-select: none;
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

	/*
	 * The column a carried group is offered. Anchored under the pill and out of
	 * the flow, so nothing below it moves while a finger is steering by it —
	 * the same reason the sheet's own landing rule has no height.
	 *
	 * Wider than the pill where the pill is short: these are list names being
	 * aimed at, not read.
	 */
	/*
	 * The lists a carried group is offered, hanging under the pill and out of
	 * the flow — a column that opened in it would move the list under the
	 * finger, and the finger is steering by what it can see, which is the same
	 * reason the sheet's landing rule has no height.
	 *
	 * The same column the menu's own dropdown draws, ground and all: it opens
	 * over the first title on the sheet, and a set of rows with nothing behind
	 * them would have the writing reading through the names.
	 */
	.dropdown.carry {
		position: absolute;
		top: 100%;
		left: 0;
		z-index: 2;
		min-width: max(100%, 11rem);
		padding-bottom: 0.5rem;
	}

	/*
	 * Nothing here is tapped, so nothing here answers a tap. The one under the
	 * finger is marked the way the switcher itself is while it holds a group: a
	 * dashed box. The row that makes a list keeps the box it already has and
	 * dashes it instead of growing a second one.
	 */
	.row.drop {
		position: relative;
		cursor: default;
	}
</style>
