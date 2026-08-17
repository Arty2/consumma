<script lang="ts">
	import { untrack } from 'svelte';
	import { browser } from '$app/environment';
	import ConfirmModal from '$lib/components/ConfirmModal.svelte';
	import ImportModal from '$lib/components/ImportModal.svelte';
	import ListSwitcher from '$lib/components/ListSwitcher.svelte';
	import Menu from '$lib/components/Menu.svelte';
	import MenuButton from '$lib/components/MenuButton.svelte';
	import Sheet from '$lib/components/Sheet.svelte';
	import SideEdge from '$lib/components/SideEdge.svelte';
	import SyncButton from '$lib/components/SyncButton.svelte';
	import ThemeButton from '$lib/components/ThemeButton.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import TornEdge from '$lib/components/TornEdge.svelte';
	import { copy, paste } from '$lib/clipboard';
	import { LIMITS } from '$lib/doc/limits';
	import { drag } from '$lib/dnd/drag.svelte';
	import { angleAt, axisAt, commits, leadFor, slideAt, SLACK } from '$lib/turn';
	import { formatCode } from '$lib/crypto/derive';
	import { applyImport } from '$lib/markdown/apply';
	import type { Parsed } from '$lib/markdown/from';
	import { toMarkdown } from '$lib/markdown/to';
	import { t } from '$lib/i18n';
	import { diagnostics } from '$lib/state/diagnostics.svelte';
	import { sheet } from '$lib/state/doc.svelte';
	import { lists } from '$lib/state/lists.svelte';
	import { sync } from '$lib/state/sync.svelte';
	import { ui } from '$lib/state/ui.svelte';

	/*
	 * Nothing sits on the page but the sheet and the buttons in its corners.
	 * Syncing, sharing, importing, clearing and the credit all live behind the
	 * one that opens the menu — the paper carries only what someone wrote on it.
	 *
	 * The theme sits beside it rather than inside it, because it is the one
	 * setting whose result is the screen itself: a control for how the sheet
	 * looks, buried under a panel that covers the sheet, cannot be seen working.
	 *
	 * The menu closes before any panel opens over it. Two focus traps at once is
	 * a keyboard trap, and returning to a menu buried under a confirm is not a
	 * step anyone wants.
	 */
	type Panel = 'menu' | 'import' | 'clear' | 'delete' | null;
	let panel = $state<Panel>(null);
	let pasted = $state<string | null>(null);

	/*
	 * The menu is the back of this sheet, so opening it turns the sheet over.
	 *
	 * One turn, two elements: the paper turns edge-on about its middle here and
	 * the panel carries the same rotation on in Menu.svelte, each taking half of
	 * `--flip`. They cannot be one element turning through 180° — the
	 * sheet is in flow and scrolls, the panel is fixed to the viewport, and
	 * putting both inside one `preserve-3d` box would mean laying the page out
	 * around the animation. Factored in two they never have to meet: at the
	 * handover both are edge-on and neither is drawn.
	 *
	 * `flip` is which half is running, and it is not the same question as which
	 * panel is open — the sheet turns back while the menu is still mounted,
	 * playing its own half.
	 */
	let flip = $state<'open' | 'close' | null>(null);
	let paper = $state<HTMLElement | null>(null);

	/*
	 * The same turn, under a finger. The sheet is turned out of the way by
	 * dragging it rightwards, exactly as the panel on the other side is — one
	 * receipt, one gesture, whichever face happens to be up.
	 *
	 * `turn` is where the drag has got the paper to and `axis` where it has
	 * pushed the point it turns about; `settling` is the swing home when a drag
	 * stops short. See src/lib/turn.ts, which both sides read.
	 */
	let turn = 0;
	let axis = 50;
	/** The lead-in: how far the paper has slid before it begins to turn. */
	let slide = 0;
	/** How far it may slide before its drawn edge reaches the screen. */
	let lead = 0;
	let dragging = $state(false);
	let settling = $state(false);
	let dragStart: { x: number; y: number; at: number } | null = null;

	/*
	 * Face down: turned away, or on its way there.
	 *
	 * It has to hold for as long as the menu is up, not just for the half-turn
	 * that put it there — the panel is still unfurling through the second half,
	 * and a sheet that sprang upright the moment its own animation ended would
	 * stand back up behind it in full view.
	 */
	const turned = $derived(flip === 'open' && panel === 'menu');

	/*
	 * Asked here rather than left to the media query, as every animation in this
	 * app is: the menu is unmounted by its own animationend, and an animation
	 * that is merely switched off never ends — the panel would stay over the
	 * sheet for good, with the focus trap still armed.
	 */
	const still = () => browser && matchMedia('(prefers-reduced-motion: reduce)').matches;

	/*
	 * Where the reader is, in the sheet's own coordinates.
	 *
	 * `transform: perspective(…)` projects towards the element's own
	 * transform-origin, and the sheet is as tall as the list — on a long one its
	 * middle is a screen or two below the fold, and the paper would turn away
	 * towards a vanishing point nobody is standing at. The Y half of a
	 * transform-origin makes no difference to a rotateY, so it is free to carry
	 * the eye instead, and this puts it level with the middle of the screen.
	 *
	 * One rect read, as the turn starts — from the tap, or from the touch that
	 * begins the drag, since the sheet may have been scrolled since the last one.
	 */
	function eye() {
		if (!paper) return;
		paper.style.setProperty('--eye', `${innerHeight / 2 - paper.getBoundingClientRect().top}px`);
		/*
		 * Half the paper's width, which the near edge's weight needs to undo the
		 * perspective magnification and which CSS has no way of asking for. A
		 * bare number, because it is divided by a bare number.
		 */
		paper.style.setProperty('--half', `${paper.clientWidth / 2}`);
	}

	/*
	 * Written straight onto the element rather than through Svelte's `style:`
	 * directive, which the panel on the other side can afford and this cannot.
	 *
	 * The sheet is prerendered, and `style:` renders as a literal `style="…"`
	 * attribute in the HTML that ships — an inline style, which `style-src
	 * 'self'` refuses outright. The panel gets away with it because it is never
	 * server-rendered: nothing is open when the page is built. Setting them
	 * through the CSSOM is the same route `--eye` already takes, and is what
	 * e2e/csp.e2e.ts is watching for.
	 */
	function place() {
		paper?.style.setProperty('--turn', `${turn}deg`);
		paper?.style.setProperty('--axis', `${axis}%`);
		paper?.style.setProperty('--slide', `${slide}px`);
	}

	/** Back to a paper nobody has touched. */
	function flat() {
		turn = 0;
		axis = 50;
		slide = 0;
		place();
	}

	function openMenu() {
		if (still()) {
			panel = 'menu';
			return;
		}

		eye();
		flip = 'open';
		panel = 'menu';
	}

	/*
	 * Turning the sheet over by hand, which is the same gesture the panel
	 * answers to on the other side.
	 *
	 * It only takes hold on bare paper. Everything on the sheet that can be
	 * pressed is a button or a field, and two of those already own a press of
	 * their own — the long press that lifts a task and the one that lifts a
	 * group. The panel draws the line in exactly this place, and a receipt that
	 * turned over when someone meant to carry a row would be worse than one that
	 * only turns from the margins.
	 */
	function onpointerdown(event: PointerEvent) {
		if (event.button !== 0 || panel !== null || flip !== null || still()) return;
		// Something is already being carried, and that gesture has the floor.
		if (drag.dragging) return;
		if ((event.target as HTMLElement).closest('input, textarea, button, a')) return;

		if (settling) {
			settling = false;
			flat();
		}

		eye();

		/*
		 * The room the paper has to slide into, measured off its own drawn edge
		 * rather than off the element's box — the side edge is inset from that
		 * by the paper's margin, and it is the drawn line that must not leave
		 * the screen.
		 */
		const edge = paper?.querySelector('svg.edge.right')?.getBoundingClientRect();
		lead = leadFor(edge ? innerWidth - edge.right : 0);

		dragStart = { x: event.clientX, y: event.clientY, at: performance.now() };
	}

	function onpointermove(event: PointerEvent) {
		if (!dragStart || !paper) return;

		const dx = event.clientX - dragStart.x;
		const dy = event.clientY - dragStart.y;

		/*
		 * The sheet is the thing that scrolls, so a finger going down the page
		 * has to keep meaning that. Until the movement is plainly sideways this
		 * is not a turn yet, and the first clearly vertical move gives it up for
		 * good rather than fighting the scroll all the way down.
		 */
		if (!dragging) {
			if (Math.abs(dy) > Math.abs(dx)) {
				dragStart = null;
				return;
			}
			if (dx <= SLACK) return;
			dragging = true;
			// On the element the handlers are on, which is not the one that moves.
			(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		}

		slide = slideAt(dx, lead);
		turn = angleAt(dx, paper.clientWidth, 1, lead);
		axis = axisAt(dx, paper.clientWidth, lead);
		place();
	}

	function onpointerup(event: PointerEvent) {
		(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
		if (!dragStart || !paper) return;

		const travelled = event.clientX - dragStart.x;
		const elapsed = performance.now() - dragStart.at;
		const held = dragging;

		dragStart = null;
		dragging = false;

		if (!held) return;

		/*
		 * Far enough and the paper carries on over from where the finger left
		 * it — the sheet's own keyframes read `--turn` for their first frame, so
		 * there is no jump between the hand and the animation, and the panel is
		 * mounted now to take the second half.
		 */
		if (commits(travelled, elapsed, paper.clientWidth, lead)) {
			flip = 'open';
			panel = 'menu';
		} else if (turn > 0 || slide > 0) settling = true;
	}

	/*
	 * Closing back onto the sheet, rather than closing to make room for a panel
	 * over it. The menu stays mounted through its own half of the turn and says
	 * when it is done; only then is it taken away.
	 */
	function closeMenu() {
		if (still()) {
			panel = null;
			return;
		}

		flip = 'close';
	}

	/*
	 * Once, on mount, and never again.
	 *
	 * These loaders write the very state they read — sync.load() parses the last
	 * synced snapshot into #lastSynced, and refresh() reads it straight back
	 * through `unsent`. Tracked, that is an effect reading and writing one piece
	 * of state, and since each load parses a fresh object it never settles:
	 * Svelte gives up with effect_update_depth_exceeded and tears the tree's
	 * reactivity down. The visible symptom was a completed join leaving the menu
	 * open and unresponsive.
	 */
	$effect(() => {
		untrack(() => {
			/*
			 * lists.load() restores whichever list was open last and points
			 * sheet/sync/ui at it, which marks their own `loaded` the same way
			 * calling them directly would — so on a device that remembers more
			 * than one list, the three calls below are already no-ops by the
			 * time they run. On a device with just the one, lists.load() finds
			 * no index and does nothing, leaving these three to load exactly as
			 * they always have.
			 */
			diagnostics.load();
			lists.load();
			sheet.load();
			ui.load();
			sync.load();
		});
	});

	// The mark has to change when the document does.
	$effect(() => {
		void sheet.doc;
		// The document is the dependency; what refresh() touches is not.
		untrack(() => sync.refresh());
	});

	async function onExport() {
		const markdown = toMarkdown(sheet.doc);
		if (markdown === '') {
			ui.say(t.toast.nothingToCopy);
			return;
		}

		const count = sheet.taskCount;
		const ok = await copy(markdown);
		ui.say(ok ? t.toast.copied({ count }) : t.toast.couldNotCopy);
	}

	async function onImport() {
		pasted = await paste();
		panel = 'import';
	}

	/* EXPORT has no panel of its own: it copies and says so in a toast. */
	async function onExportFromMenu() {
		panel = null;
		await onExport();
	}

	function applyMarkdown(parsed: Parsed, mode: 'add' | 'replace') {
		const ctx = sheet.ctx;
		if (!ctx) return;

		const result = applyImport(sheet.doc, ctx, parsed, mode);
		panel = null;

		/*
		 * Written from LIMITS rather than spelled out. These two were the only
		 * messages in the app that typed the number a second time, so raising a
		 * limit moved the sheet's copy and left these two saying the old one.
		 */
		if (result.refused === 'tasks') {
			ui.say(t.toast.overTasks({ max: LIMITS.tasks }));
			return;
		}
		if (result.refused === 'groups') {
			ui.say(t.toast.overGroups({ max: LIMITS.groups }));
			return;
		}

		sheet.replace(result.doc);
		ui.say(
			result.skipped > 0
				? t.toast.addedSkipped({ count: result.added, skipped: result.skipped })
				: t.toast.added({ count: result.added })
		);
	}

	function onClear() {
		panel = null;
		const cleared = sheet.clearDone();
		if (cleared.length === 0) return;

		// The confirm stops the accident; the undo covers the change of mind.
		ui.say(t.toast.cleared({ count: cleared.length }), () => {
			sheet.restore(cleared);
			ui.dismiss();
		});
	}

	function onDelete() {
		panel = null;
		lists.deleteCurrent();
		ui.say(t.toast.left);
	}
</script>

<div
	class="page"
	class:turning={turned}
	class:returning={flip === 'close'}
	class:dragging
	class:settling
	bind:this={paper}
	onanimationend={(event) => {
		/*
		 * The paper's own turn, and only that: a task popping or a checkbox
		 * sparkling anywhere on the sheet bubbles an animationend through here
		 * as well, and either would stand the paper up mid-turn.
		 */
		if (event.target !== paper) return;
		/*
		 * The axis comes home on its own shorter clock, so it ends first and
		 * separately. This is about the turn, which is the other one.
		 */
		if (event.animationName === 'recentre') return;

		if (flip === 'close') flip = null;
		else if (settling) settling = false;

		/*
		 * Safe even under `.turning`, which is still holding the sheet edge-on:
		 * that animation has finished and is filling at its last frame, so the
		 * first frame this resets is no longer being read.
		 */
		flat();
	}}
>
	<!-- Room above the tear, so the stroke is never clipped by the viewport. -->
	<div class="top">
		<TornEdge seed="top" />
	</div>

	<!--
		The tears close the paper top and bottom; these close it at the sides, so
		it reads as a strip of paper rather than as text on a page.
	-->
	<!--
		The turn is taken here rather than on `.page`, which is the element that
		actually moves: a landmark carries a role of its own, and a bare div with
		a pointer handler on it does not. It is also the paper proper — the two
		tears above and below it are the only part of the sheet a drag misses.
	-->
	<main
		data-sheet
		{onpointerdown}
		{onpointermove}
		{onpointerup}
		onpointercancel={() => {
			dragStart = null;
			if (dragging) {
				dragging = false;
				if (turn > 0 || slide > 0) settling = true;
			}
		}}
	>
		<div class="sides">
			<SideEdge seed="left" side="left" />
			<SideEdge seed="right" side="right" />
		</div>

		<!--
			Sync on its own at the left, because it is the one that comes and goes;
			the switcher sits between it and the two that are always there, which
			stay together on the right, where the thumb already knows to find the
			burger. Only ever here once there is a second list to choose between —
			see ListSwitcher.
		-->
		<div class="corner">
			<SyncButton />
			<ListSwitcher />
			<div class="controls">
				<ThemeButton />
				<MenuButton onopen={openMenu} />
			</div>
		</div>
		<!--
			Keyed on which list is open, so a row a task was being typed into, or a
			drag in progress, does not survive into another list's markup — Sheet's
			own state (the new-group draft, the open caret) belongs to the list it
			was opened on, not to the component instance.
		-->
		{#key lists.current}
			<Sheet />
		{/key}
	</main>

	<div class="bottom">
		<TornEdge seed="bottom" flip />
	</div>
</div>

{#if panel === 'menu'}
	<Menu
		closing={flip === 'close'}
		onclose={closeMenu}
		onclosed={() => (panel = null)}
		onimport={onImport}
		onexport={onExportFromMenu}
		onclear={() => (panel = 'clear')}
		ondelete={() => (panel = 'delete')}
	/>
{:else if panel === 'import'}
	<ImportModal initial={pasted} onapply={applyMarkdown} onclose={() => (panel = null)} />
{:else if panel === 'clear'}
	<ConfirmModal
		title={t.confirm.clearTitle}
		seed="clear"
		confirmLabel={t.confirm.clearConfirm}
		onconfirm={onClear}
		oncancel={() => (panel = null)}
	>
		{t.confirm.clearBody({ count: sheet.doneCount })}
	</ConfirmModal>
{:else if panel === 'delete'}
	<ConfirmModal
		title={t.confirm.leaveTitle}
		seed="delete"
		confirmLabel={t.confirm.leaveConfirm}
		onconfirm={onDelete}
		oncancel={() => (panel = null)}
	>
		{#if sync.code}
			{t.confirm.leaveBody({ code: formatCode(sync.code) })}
			{#if sync.unsent > 0}
				{t.confirm.leaveUnsent({ count: sync.unsent })}
			{/if}
		{:else}
			<!--
				Never synced, so there is no code to write down and nobody else holding
				a copy. Offering one last look at a code would be offering nothing.
			-->
			{t.confirm.leaveBodyNoCode}
		{/if}
	</ConfirmModal>
{/if}

<Toast />

<style>
	/*
	 * The paper's own box, and the menu is laid out from the same variables —
	 * the panel is the back of this sheet, not a drawer beside it. See app.css.
	 */
	.page {
		max-width: var(--paper-width);
		margin: 0 auto;
		padding: 0 var(--paper-x) var(--paper-bottom);

		/*
		 * Turned about the middle of the paper, not about an edge.
		 *
		 * A receipt turned over is held in the middle and spun; hinged at a side
		 * it is a door or a page in a book, which is a different object. The
		 * middle is also the only axis that does not favour a hand: the sheet
		 * narrows to the same line from both sides at once.
		 *
		 * `--eye` is the Y half, and it is not the axis — a rotateY is the same
		 * rotation wherever the origin sits vertically. It is the vanishing
		 * point, which `perspective()` takes from the transform-origin too, and
		 * on a sheet as tall as its list the middle of the element is nowhere
		 * near the middle of the screen. This file writes it as the turn starts.
		 *
		 * `--axis` is the X half, and that one does move: a hand pushes the point
		 * the paper turns about off the middle, and `recentre` in app.css brings
		 * it back before the paper is edge-on.
		 */
		transform-origin: var(--axis, 50%) var(--eye, 50%);

		/*
		 */
	}

	/*
	 * Under a finger. The transform is only here while it is, so a sheet as long
	 * as its list is not held on a compositor layer for the life of the page.
	 */
	/*
	 * The transform is a plain rule reading the angle, and the keyframes animate
	 * the angle. Written the other way round — the angle in the keyframes and
	 * the transform beside it — the two had to be kept in step by hand, and
	 * anything else reading the angle was reading a number the paper was not at.
	 *
	 * Only while it is turning, so a sheet as long as its list is not held on a
	 * compositor layer for the life of the page.
	 */
	.dragging,
	.turning,
	.settling,
	.returning {
		/*
		 * The slide is a `translate` rather than part of the transform, so the
		 * two compose without either having to know about the other — the same
		 * arrangement the panel uses to stay centred while it turns.
		 */
		transform: perspective(1200px) rotateY(var(--turn, 0deg));
		will-change: transform;
	}

	.dragging {
		translate: var(--slide, 0px) 0;
	}

	/*
	 * The first half of the turn, and then held: `forwards` keeps the paper
	 * edge-on for as long as the menu is up, because the panel goes on unfurling
	 * after this animation has ended.
	 *
	 * It starts from `--turn`, which is nought from a tap and wherever the finger
	 * left the paper from a drag — so the hand hands over to the animation with
	 * no jump. `recentre` runs on its own shorter clock beside it.
	 */
	.turning {
		animation:
			turn-away var(--flip) ease-in forwards,
			recentre calc(var(--flip) * 0.6) var(--inertia) forwards;
	}

	/* A drag that stopped short. The paper swings back up and the axis home. */
	.settling {
		animation:
			settle var(--flip) var(--inertia) forwards,
			recentre calc(var(--flip) * 0.6) var(--inertia) forwards;
	}

	/*
	 * The second half. Delayed by one half-turn, since the panel has to furl
	 * shut before there is anything to come back to; `both` holds the paper
	 * edge-on through that wait rather than standing it up and turning it away
	 * again.
	 */
	.returning {
		animation: turn-back var(--flip) ease-out var(--flip) both;
	}

	@keyframes turn-away {
		from {
			translate: var(--slide, 0px) 0;
		}
		to {
			--turn: 90deg;
			translate: 0 0;
		}
	}

	@keyframes settle {
		from {
			translate: var(--slide, 0px) 0;
		}
		to {
			--turn: 0deg;
			translate: 0 0;
		}
	}

	/*
	 * Coming back round, not coming back. The sheet went out leading with its
	 * left edge and returns settling out of its right, a quarter further along
	 * the same rotation rather than a quarter back down it.
	 *
	 * Stated rather than inherited, unlike the two above: this one does not
	 * continue from where the paper is, it picks it up a quarter round the other
	 * side. Nothing is seen of the jump — both are edge-on, the sheet has no
	 * width at either, and the panel is over it at full width at that moment.
	 */
	@keyframes turn-back {
		from {
			--turn: -90deg;
		}
		to {
			--turn: 0deg;
		}
	}

	/*
	 * Both tears sit above the sides, which run up into them to be cut.
	 *
	 * The top one is written before the sides and the bottom one after, so
	 * document order alone would put one over them and one under. Positioning
	 * both and lifting them says it once for the pair, rather than leaving the
	 * bottom edge cut and the top edge crossing its own teeth.
	 */
	.top,
	.bottom {
		position: relative;
		z-index: 1;
		/*
		 * Trimmed to the two side edges, so the tear runs between them rather
		 * than past them. `--edge` is the side's box and its stroke runs down
		 * the middle of it, so half of that is where the corner is: the zigzag
		 * now ends on the vertical instead of overshooting it by a few pixels
		 * and leaving a whisker of paper's edge sticking out into the margin.
		 */
		padding-inline: calc(var(--edge) / 2);
	}

	.top {
		padding-top: var(--paper-top);
	}

	/*
	 * The sides overhang the paper by a tear at each end, and are cut back by
	 * the teeth — the same thing the tear does to the writing that scrolls
	 * behind it. Stopped flush at the tears they ended on a clean horizontal,
	 * which is a sheet guillotined at three edges and torn at the top.
	 */
	.sides {
		position: absolute;
		top: calc(-1 * var(--tear));
		right: 0;
		bottom: calc(-1 * var(--tear));
		left: 0;
		pointer-events: none;
	}

	/*
	 * Holds the two side edges, which span whatever the list comes to. The
	 * padding keeps the writing off them — a title running into the edge of the
	 * paper reads as a mistake.
	 */
	main {
		display: block;
		position: relative;
		padding: 0 var(--paper-inset);

		/*
		 * The receipt is never shorter than the screen it is on.
		 *
		 * A list of three lines used to be a strip of paper a few centimetres
		 * tall floating at the top of an empty screen, which is a note pinned to
		 * a wall rather than a receipt. Below this it grows with the list exactly
		 * as it did: `min-height` sets a floor and nothing else.
		 *
		 * The arithmetic is the rest of the sheet subtracted from the screen —
		 * the room above and below the paper, and the two tears — so the whole
		 * receipt comes to the viewport rather than this one part of it.
		 *
		 * It also makes the two faces the same size. The panel has always been
		 * `top: 0; bottom: 0`, so on a short list the turn swapped a small paper
		 * for a screen-tall one, which is the one thing that gave away that
		 * there were two of them.
		 *
		 * `svh` and not `dvh`: the small viewport is the one that does not move
		 * when a phone shows and hides its chrome. The edges are drawn to their
		 * measured height and re-cut when it changes, so a paper that breathed
		 * with the URL bar would re-cut its own sides while being scrolled. The
		 * two agree whenever this floor is doing anything anyway — a sheet no
		 * taller than the screen does not scroll, and chrome that is not being
		 * scrolled does not hide.
		 */
		min-height: calc(100svh - var(--paper-top) - var(--paper-bottom) - var(--tear) * 2);

		/*
		 * A finger going down the page still scrolls it; only sideways is ours,
		 * and that is the turn. Pinch is spelt out because `pan-y` on its own
		 * would take zoom away with it, and this is a sheet of words.
		 *
		 * The rows inside set `pan-y` for their own reasons and keep it: the
		 * used value is the narrower of the two, so nothing here loosens them.
		 */
		touch-action: pan-y pinch-zoom;
	}

	/*
	 * The buttons sit in the sheet's top corners with a row to themselves. They
	 * used to be positioned over the sheet, where the first task row covered
	 * them and swallowed the tap. The switcher, when there is one, rides the
	 * same row between sync and the pair on the right, rather than a row of
	 * its own — one line of controls, not two.
	 *
	 * The margin under it is enough to part the buttons from the first title
	 * without opening a hole between them — the row already brings its own
	 * air, since the buttons are touch targets a good deal taller than their
	 * ink and the title's line box is taller than its letters. Measured
	 * against what the eye actually sees (bottom of the burger's stroke to
	 * the top of the first title) rather than picked off the spacing scale,
	 * which is why it is not a multiple of `--paper-inset`: two thirds of the
	 * gap is already there before this adds anything.
	 */
	.corner {
		display: flex;
		align-items: center;
		padding-top: var(--corner-lead);
		margin-bottom: 0.5rem;
	}

	/*
	 * `margin-left: auto` rather than `space-between` on the row: the sync
	 * button is not there at all when there is nothing to sync, and
	 * space-between with one child left pushes that child to the *left* — which
	 * put the burger under the thumb's left hand on an untouched sheet.
	 */
	.controls {
		display: flex;
		margin-left: auto;
	}
</style>
