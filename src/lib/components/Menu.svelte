<script module lang="ts">
	/*
	 * Where the panel was left, for as long as the app is open and no longer.
	 *
	 * Coming back to a menu scrolled to the top after going down it to press
	 * something is the panel forgetting a place you were just standing in. But
	 * it is not a preference either: it belongs to this visit the way a finger
	 * held in a page belongs to this reading. Module scope, so it is shared by
	 * however many times the panel is opened and dies with the tab — nothing in
	 * `KEYS`, nothing on disk. Arriving still writes nothing.
	 */
	let remembered = 0;
</script>

<script lang="ts">
	import { browser } from '$app/environment';
	import CodeField from './CodeField.svelte';
	import HandRect from './HandRect.svelte';
	import ListSwitcher from './ListSwitcher.svelte';
	import Perforation from './Perforation.svelte';
	import SideEdge from './SideEdge.svelte';
	import TextRule from './TextRule.svelte';
	import TornEdge from './TornEdge.svelte';
	import { trap } from '$lib/a11y/trap';
	import { copy, share } from '$lib/clipboard';
	import { formatCode, normaliseCode } from '$lib/crypto/derive';
	import { handBack } from '$lib/draw/hand';
	import { seedFrom } from '$lib/draw/rng';
	import { diagnostics } from '$lib/state/diagnostics.svelte';
	import { sheet } from '$lib/state/doc.svelte';
	import { sync } from '$lib/state/sync.svelte';
	import { statusText } from '$lib/sync/status';
	import { angleAt, axisAt, commits, leadFor, slideAt, SLACK } from '$lib/turn';

	/*
	 * Everything that is not the list itself. The sheet keeps only what someone
	 * wrote on it; syncing, sharing, importing, clearing and the credit all live
	 * behind the one button in the corner.
	 *
	 * It comes in from the right and covers the page rather than dimming it —
	 * a scrim means grey, and grey does not exist here.
	 */

	type Props = {
		/** Set by the page once the paper has begun turning back over. */
		closing?: boolean;
		onclose: () => void;
		/** The panel's half of the turn is done and it can be taken away. */
		onclosed?: () => void;
		onimport: () => void;
		onexport: () => void;
		onclear: () => void;
		ondelete: () => void;
	};

	let {
		closing = false,
		onclose,
		onclosed,
		onimport,
		onexport,
		onclear,
		ondelete
	}: Props = $props();

	/*
	 * Asking twice to close is asking once. Escape during the furl, or a second
	 * tap on the arrow, would otherwise restart the turn from the top.
	 */
	function close() {
		if (closing) return;
		onclose();
	}

	let entered = $state('');
	let joining = $state(false);
	let error = $state<string | null>(null);
	/** Set when the server answered and said no, which is not being offline. */
	let refused = $state(false);
	let copied = $state(false);

	let panel = $state<HTMLElement | null>(null);
	let scroller = $state<HTMLElement | null>(null);
	/*
	 * How far the paper has been turned back by a finger, in degrees. A drag is
	 * the same gesture as the animation now — the panel is the back of a sheet
	 * and pulling it rightwards turns it over, rather than sliding it off to one
	 * side as though there were somewhere beside the paper for it to go.
	 */
	let turn = $state(0);
	/** Where the axis has been pushed to, as a percentage across the paper. */
	let axis = $state(50);
	/** The lead-in: how far the panel has slid before it begins to turn. */
	let slide = $state(0);
	/** How far it may slide before its drawn edge reaches the screen. */
	let lead = 0;
	/** Swinging home after a drag that did not go far enough to close. */
	let springing = $state(false);
	/** Whether this gesture turned the paper, and so was not a press. */
	let moved = false;
	let dragStart: { x: number; at: number } | null = null;

	/*
	 * Unfurling, once, on arrival — cleared by its own animationend so the drag
	 * can take the transform over afterwards.
	 *
	 * Asked in JS rather than left to the media query, as every animation here
	 * is. The reduced-motion backstop in app.css shortens durations but says
	 * nothing about delays, and this animation is held back half a turn while
	 * the sheet gets out of the way — under reduced motion that delay would
	 * survive on its own and leave the panel edge-on and unreadable for it.
	 */
	let entering = $state(browser && !matchMedia('(prefers-reduced-motion: reduce)').matches);
	let logCopied = $state(false);

	/*
	 * The same size as the burger, in the same place, because it is the same
	 * corner of the same sheet seen from the other side.
	 *
	 * An arrow back rather than a ✕. A cross closes something that was put on
	 * top; nothing was put on top here — the paper was turned over, and what
	 * this does is turn it back. It is also the one mark on the panel that has
	 * to say where a tap goes rather than what a thing is.
	 */
	const CLOSE = 22;

	const back = $derived(handBack(CLOSE, { seed: seedFrom('backtolist'), wobble: 0.8 }));

	const summary = $derived(statusText(sync.status, sync.unsent, refused));
	const valid = $derived(normaliseCode(entered) !== null);
	/** Joining with tasks already here is never decided silently. */
	const hasLocal = $derived(sheet.taskCount > 0);

	/**
	 * One payload, carrying the link and the code together — either alone is
	 * useless. Built ahead of the click so the share sheet can be opened
	 * synchronously inside the handler.
	 *
	 * Two lines and nothing else: no title, no sentence explaining what this
	 * is. The prose put the code at the end of a line that began "Code: ", so
	 * getting at it meant selecting into the middle of a sentence. On its own
	 * line it is one thing to grab.
	 *
	 * The link is bare. The code is never a query parameter or a fragment.
	 */
	const invitation = $derived(sync.code ? `${location.origin}\n${formatCode(sync.code)}` : '');

	/*
	 * Back where it was left. Set before the first paint the panel is visible
	 * for — it unfurls a half-turn after the tap, so there is time in hand — and
	 * guarded, because a panel shorter than it was cannot be scrolled that far
	 * and the browser would clamp it to something that then gets written back.
	 */
	$effect(() => {
		if (!scroller || remembered === 0) return;
		scroller.scrollTop = remembered;
	});

	// Nothing else advances the clock, so the cooldown would never clear while
	// the menu is open and looking at it.
	$effect(() => {
		sync.now = Date.now();
		const tick = setInterval(() => (sync.now = Date.now()), 500);
		return () => clearInterval(tick);
	});

	/*
	 * Not forced: the cooldown is the whole reason a second tap costs nothing.
	 * Joining forces, because that is a different request the person has just
	 * asked for.
	 */
	async function syncNow() {
		error = null;
		const outcome = await sync.sync();

		refused = outcome?.status === 'refused';
		if (outcome && outcome.status !== 'synced') error = sync.message;
	}

	function onShare() {
		share(invitation).then((result) => {
			if (result === 'copied') copied = true;
		});
	}

	/*
	 * The code alone, not the invitation.
	 *
	 * SHARE is the way to hand someone the whole thing; this button sits under
	 * the code, and what a button under a code copies is the code. Pasting it
	 * into a message already being written, or into the other phone's JOIN
	 * field, is the whole of what it is for.
	 */
	async function onCopy() {
		copied = sync.code ? await copy(formatCode(sync.code)) : false;
	}

	/**
	 * A phone has no console to open. This is the same trail, read off the
	 * device it happened on rather than a screen nobody here has — copied as
	 * plain text, because pasting it somewhere is the whole point of keeping
	 * it.
	 */
	async function onCopyLog() {
		const text = diagnostics.entries.join('\n');
		logCopied = text !== '' && (await copy(text));
	}

	async function join(keep: boolean) {
		error = null;
		joining = false;

		const outcome = await sync.join(entered, keep);
		if (!outcome) {
			error = 'That doesn’t look like a code.';
			return;
		}
		if (outcome.status !== 'synced') {
			error = sync.message;
			return;
		}

		entered = '';
		close();
	}

	/*
	 * Rightwards only: the menu came from there and goes back the same way.
	 *
	 * The distance travelled is read as a fraction of the paper's width and
	 * turned into an angle, so a drag across the whole panel is the whole
	 * quarter-turn that takes it edge-on.
	 *
	 * It takes hold over the buttons too, and that is where this parts company
	 * with the sheet. The sheet bails on anything pressable because its rows own
	 * a press already — the long presses that lift a task and a group — but
	 * nothing on the panel does: every button here is a tap and nothing more, so
	 * a finger that starts on SYNC NOW and travels is plainly turning the paper
	 * rather than pressing anything. Most of the panel is buttons, and a gesture
	 * that only worked in the gaps between them was a gesture that mostly did
	 * not work.
	 *
	 * Text fields still keep their own drag, which is selecting text.
	 */
	function onpointerdown(event: PointerEvent) {
		if (event.button !== 0 || closing) return;
		if ((event.target as HTMLElement).closest('input, textarea')) return;

		moved = false;

		/*
		 * Caught on its way home. It is only ever a few degrees out by then —
		 * a spring follows a drag too short to close — so it is put flat and the
		 * new drag is measured from there, rather than handing the finger a
		 * paper that jumps back to where the last one left it.
		 */
		if (springing) {
			springing = false;
			turn = 0;
			axis = 50;
		}

		/*
		 * The room the panel has to slide into, off its own drawn edge rather
		 * than off its box: the edge is inset from that by the paper's margin,
		 * and it is the drawn line that must not leave the screen.
		 */
		const edge = panel?.querySelector('svg.edge.right')?.getBoundingClientRect();
		lead = leadFor(edge ? innerWidth - edge.right : 0);
		// See `eye()` in +page.svelte: the near edge's weight needs this and CSS
		// has no way of asking for it.
		panel?.style.setProperty('--half', `${panel.clientWidth / 2}`);

		dragStart = { x: event.clientX, at: performance.now() };
	}

	function onpointermove(event: PointerEvent) {
		if (!dragStart || !panel) return;
		const travelled = event.clientX - dragStart.x;

		if (!moved) {
			if (travelled <= SLACK) return;
			moved = true;

			/*
			 * The gesture belongs to the panel from here until the finger lifts,
			 * wherever the paper has got to by then. Turning it takes it out from
			 * under the hand — that is what turning it means — and without this
			 * the pointer events go to whatever is under the finger instead,
			 * which partway through a turn is the sheet behind: the move stops
			 * being seen and the release is never heard, so the paper hangs at
			 * the angle it reached.
			 *
			 * Taken here rather than on the press, now that a press may land on a
			 * button. Capturing a pointer retargets the click that follows it to
			 * whatever holds the capture, so taking it on `pointerdown` stopped
			 * every button on the panel working — the click arrived at the panel
			 * rather than at the button under the finger. A press that never
			 * travels never captures, and so is still a press.
			 */
			panel.setPointerCapture(event.pointerId);
		}

		slide = slideAt(travelled, lead);
		turn = angleAt(travelled, panel.clientWidth, 1, lead);
		axis = axisAt(travelled, panel.clientWidth, lead);
	}

	function onpointerup(event: PointerEvent) {
		panel?.releasePointerCapture(event.pointerId);
		if (!dragStart || !panel) return;

		const travelled = event.clientX - dragStart.x;
		const elapsed = performance.now() - dragStart.at;

		dragStart = null;

		/*
		 * Let go far enough and the paper carries on turning over from wherever
		 * the finger left it — the furl reads `--turn` for its first frame, so
		 * there is no jump between the hand and the animation. Short of that it
		 * swings back upright, which it now actually does: it used to snap.
		 */
		if (commits(travelled, elapsed, panel.clientWidth, lead)) close();
		else if (turn > 0 || slide > 0) springing = true;
	}
</script>

<div
	class="menu"
	role="dialog"
	aria-modal="true"
	aria-label="Menu"
	tabindex="-1"
	class:unfurling={entering}
	class:furling={closing}
	class:springing
	style:--turn="{turn}deg"
	style:--axis="{axis}%"
	style:--slide="{slide}px"
	bind:this={panel}
	use:trap={close}
	{onpointerdown}
	{onpointermove}
	{onpointerup}
	onclickcapture={(event) => {
		/*
		 * A drag that crossed a button is not a press of it. Swallowed in the
		 * capture phase, before the button's own handler runs — the sheet does
		 * the same after a row is dropped, and for the same reason.
		 */
		if (!moved) return;
		moved = false;
		event.preventDefault();
		event.stopPropagation();
	}}
	onpointercancel={() => {
		dragStart = null;
		if ((turn > 0 || slide > 0) && !closing) springing = true;
	}}
	onanimationend={(event) => {
		/*
		 * The panel's own turn, and only that — a boxed button's mark or a row
		 * inside the switcher would otherwise end the panel's animation for it.
		 */
		if (event.target !== panel) return;
		/*
		 * The axis comes home on a shorter clock than the turn, so it ends
		 * first. Taken as the turn's own end it would hand the panel back to
		 * the page before the paper had finished going over.
		 */
		if (event.animationName === 'recentre') return;

		if (closing) onclosed?.();
		else if (springing) {
			springing = false;
			turn = 0;
			axis = 50;
			slide = 0;
		} else entering = false;
	}}
>
	<!--
		The back of the same receipt, closed by the same four edges — and closed
		with the very seeds the sheet uses, turned left for right. A tear is a
		tear all the way through the paper: seen from behind it is the same one
		reversed, and the edge down the sheet's left is the edge down the panel's
		right. That is the whole reason these are not new marks.
	-->
	<div class="edges" aria-hidden="true">
		<!--
			The sides come first so both tears are drawn over them. They run up
			into the tears and are cut back by the teeth, the same way the
			writing behind a tear is, and a side drawn after the tear it runs
			into would cross its own teeth instead.
		-->
		<div class="sides">
			<SideEdge seed="right" side="left" mirror />
			<SideEdge seed="left" side="right" mirror />
		</div>
		<div class="tear-edge top"><TornEdge seed="top" mirror /></div>
		<div class="tear-edge bottom"><TornEdge seed="bottom" flip mirror /></div>
	</div>

	<button class="close" type="button" onclick={close} aria-label="Close">
		<svg viewBox="0 0 {CLOSE} {CLOSE}" width={CLOSE} height={CLOSE} aria-hidden="true">
			<!--
				The same two strokes drawn twice: once in the paper, wide, and then
				in the ink on top. It is the mark's own shape held clear of whatever
				has scrolled under it, rather than a box of ground around it — a
				square of paper cut the line it landed on in half, and the panel has
				no rectangles on it anywhere else.
			-->
			<path d={back} class="drawn knockout" />
			<path d={back} class="drawn" />
		</svg>
	</button>

	<div
		class="scroll"
		bind:this={scroller}
		onscroll={() => {
			if (scroller) remembered = scroller.scrollTop;
		}}
	>
		<div class="body">
			<!--
				Answers which list this is before anything else in the panel does —
				the same reason it stands first above the sheet. Always shown here,
				unlike its copy above the sheet: with the button that used to make a
				second list gone, this is the only place left to reach one from
				while there is still just the first. Sticks where the ✕ sits (see
				ListSwitcher.svelte) rather than scrolling away with the rest of the
				panel, so opening the menu does not visibly move it — but its
				dropdown, when open, is ordinary content and scrolls like everything
				else beneath it.
			-->
			<ListSwitcher context="menu" onafterselect={close} />

			<!--
				Two sentences, never one. How much is waiting is what people want to
				know; whether the list could be reached is a condition, not a failure,
				and folding it into the same line made "Offline" read like an error.
			-->
			<p class="headline">{summary.headline}</p>
			{#if summary.detail}
				<p class="detail">{summary.detail}</p>
			{/if}

			<!--
				Nothing written and no code: there is nothing to send and no list to
				fetch, so the button says so by being unavailable rather than
				minting a code for an empty sheet — see `sync.syncable`.
			-->
			<button
				type="button"
				class="caps boxed action"
				disabled={sync.busy || sync.cooling || !sync.syncable}
				onclick={syncNow}
			>
				<HandRect seed="btnsync" wobble={1.4} radius={3} />
				{#if sync.busy}
					Syncing…
				{:else if sync.cooling}
					Sync now ({sync.coolingFor})
				{:else}
					Sync now
				{/if}
			</button>

			{#if error}
				<p class="error" role="alert">{error}</p>
			{/if}

			<!--
				The panel's sections are told apart by a tear across the paper, the
				same mark Loose ends is. They are already named by their headings;
				what was missing was the line saying where one stops.
			-->
			<div class="tear"><Perforation seed="menu-list" /></div>

			<h2 class="caps">This list</h2>
			<TextRule text="This list" seed="thislist" centred />

			{#if sync.code}
				<p class="code">{formatCode(sync.code)}</p>

				<div class="pair">
					<button type="button" class="caps boxed" onclick={onShare}>
						<HandRect seed="btnshare" wobble={1.4} radius={3} />
						Share
					</button>
					<button type="button" class="caps boxed" onclick={onCopy}>
						<HandRect seed="btncopy" wobble={1.4} radius={3} />
						{copied ? 'Copied' : 'Copy'}
					</button>
				</div>

				<p class="note">Anyone with this code can read and change the list.</p>
			{:else}
				<!--
					A code is the address of something on the server, and until a sync
					there is nothing at it. Handing one over early would send someone to
					an empty sheet and leave both of them wondering which of the two had
					got it wrong.
				-->
				<p class="note">Only on this device. Sync it to get a code you can share.</p>
			{/if}

			<div class="pair apart">
				<button type="button" class="caps boxed" onclick={onimport}>
					<HandRect seed="btnimport" wobble={1.4} radius={3} />
					Import
				</button>
				<button type="button" class="caps boxed" onclick={onexport}>
					<HandRect seed="btnexport" wobble={1.4} radius={3} />
					Export
				</button>
			</div>

			<!-- The only two that take something away, and both stop and ask. -->
			<div class="pair">
				<button
					type="button"
					class="caps boxed"
					class:nothing={sheet.doneCount === 0}
					disabled={sheet.doneCount === 0}
					onclick={onclear}
				>
					<HandRect seed="btnclear" wobble={1.4} radius={3} />
					Clear
				</button>
				<button type="button" class="caps boxed" onclick={ondelete}>
					<HandRect seed="btndelete" wobble={1.4} radius={3} />
					Leave
				</button>
			</div>

			<div class="tear"><Perforation seed="menu-join" /></div>

			<h2 class="caps">Join list</h2>
			<TextRule text="Join list" seed="joinlist" centred />

			<CodeField bind:value={entered} label="Code" />

			{#if joining}
				<!-- Ask whether to merge or discard. Never decide silently. -->
				<p class="ask">
					You have {sheet.taskCount}
					{sheet.taskCount === 1 ? 'task' : 'tasks'} here. Take them to the other list, or leave them
					behind?
				</p>
				<div class="pair wrap">
					<button type="button" class="caps boxed" onclick={() => join(true)}>
						<HandRect seed="btntake" wobble={1.4} radius={3} />
						Take them
					</button>
					<button type="button" class="caps boxed" onclick={() => join(false)}>
						<HandRect seed="btnleave" wobble={1.4} radius={3} />
						Leave them
					</button>
					<button type="button" class="caps boxed" onclick={() => (joining = false)}>
						<HandRect seed="btncancel" wobble={1.4} radius={3} />
						Cancel
					</button>
				</div>
			{:else}
				<button
					type="button"
					class="caps boxed action"
					disabled={!valid || sync.busy}
					onclick={() => (hasLocal ? (joining = true) : join(false))}
				>
					<HandRect seed="btnjoin" wobble={1.4} radius={3} />
					Join
				</button>
			{/if}

			<!--
				No heading of its own — just the tear every other section gets,
				marking off what every sync and join attempt actually did, on this
				device only, kept only while this is on. No console to open on a
				phone; Copy is how it leaves.
			-->
			<div class="tear"><Perforation seed="menu-debug" /></div>

			<div class="pair debug">
				<button type="button" class="caps boxed" onclick={() => diagnostics.toggle()}>
					<HandRect seed="btndebug" wobble={1.4} radius={3} />
					Debug log: {diagnostics.enabled ? 'On' : 'Off'}
				</button>
				{#if diagnostics.enabled && diagnostics.entries.length > 0}
					<button type="button" class="caps boxed" onclick={onCopyLog}>
						<HandRect seed="btncopylog" wobble={1.4} radius={3} />
						{logCopied ? 'Copied' : 'Copy'}
					</button>
				{/if}
			</div>

			{#if diagnostics.enabled && diagnostics.entries.length > 0}
				<div class="log" role="log" aria-label="Debug log">
					{#each diagnostics.entries as entry, i (i)}
						<p class="entry">{entry}</p>
					{/each}
				</div>
			{/if}

			<footer class="credit">
				<div class="tear"><Perforation seed="menu-credit" /></div>
				<!--
					The one link off this origin, and it goes to the project's own
					page. A new tab and nothing carried with it, exactly as a link in
					a task is: the list is held in this tab and lives on a key in
					this browser, so navigating it away is not a thing to do by
					accident.
				-->
				<p>
					v{__VERSION__} •
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
					<a href="https://heracl.es/consumma" target="_blank" rel="noopener noreferrer nofollow"
						>heracl.es/consumma</a
					>
				</p>
				<p class="dedication">
					Dialectic Acheropoieton<br />of Heracles Papatheodorou and Claude
				</p>
			</footer>
		</div>
	</div>
</div>

<style>
	/*
	 * From the right, and the full width of a phone — at that size a drawer and
	 * a panel are the same thing, and half a sheet of paper is not a shape this
	 * app has.
	 */
	/*
	 * The same piece of paper as the sheet, seen from the back.
	 *
	 * It used to be a 24rem drawer pinned to the right edge, which on anything
	 * wider than a phone opened a panel of one width over a sheet of another,
	 * with its own margins and its own top. Laid out from the paper's own
	 * variables it lands exactly on the sheet at every width — same width, same
	 * margins, same room above and below the tear — so opening the menu turns
	 * the list over rather than sliding something else in front of it.
	 *
	 * Centred like the page, and centred with `translate` rather than with
	 * `transform`, which leaves the transform free for the turn: the two are
	 * separate properties and compose without either clobbering the other.
	 */
	.menu {
		position: fixed;
		top: 0;
		bottom: 0;
		left: 50%;
		width: 100%;
		max-width: var(--paper-width);
		z-index: 10;
		background: var(--paper);
		/*
		 * The paper begins where the paper begins, not at the viewport.
		 *
		 * `padding-block` below is the room the sheet keeps above and below
		 * itself, so the content box starts at the top tear's outer edge and
		 * ends at the bottom one's. Clipped to it, the panel's ground is the
		 * paper and the margins around it are not — which is what lets each
		 * tear's own ground cut into it from outside.
		 */
		background-clip: content-box;
		display: flex;
		flex-direction: column;
		outline: none;
		touch-action: pan-y;
		translate: calc(-50% + var(--slide, 0px)) 0;

		/*
		 * The sheet's own axis. Both are `--paper-width` and both are centred,
		 * so the middle of one is the middle of the other — the paper turns
		 * about a single line rather than about two that nearly agree. See
		 * `--flip` and `--paper-width` in app.css.
		 *
		 * At rest `--turn` is nought and this is the identity; under a finger it
		 * is the angle the paper has been turned back by. The perspective is the
		 * same 1200px the sheet projects at, so the two halves of the turn are
		 * seen from one place.
		 */
		transform-origin: var(--axis, 50%) 50%;
		/*
		 * A plain rule reading the angle; the keyframes animate the angle. See
		 * `@property --turn` in app.css — everything that is a reading of the
		 * rotation falls out of that one number rather than being written twice.
		 */
		transform: perspective(1200px) rotateY(var(--turn, 0deg));
		/*
		 * The paper's own top and bottom, so the scroller inside is exactly the
		 * frame's box and the content is cut where the paper stops. Cut at the
		 * viewport instead, a button halfway out of the panel went on being
		 * drawn in the margin below the drawn edge, which reads as the panel
		 * leaking rather than as paper ending.
		 */
		/*
		 * The paper's own top and bottom, and no more: the scroller runs the
		 * full height of the paper, tears included.
		 *
		 * It used to stop at the inner edge of each tear, which cut the writing
		 * along a straight line a tooth's height short of the teeth — a white
		 * rectangle doing the work the tear is there to do. The room the
		 * writing needs above and below is `.scroll`'s own padding instead, so
		 * a line starts exactly where it always did and is cut, on its way out,
		 * by the teeth.
		 */
		padding-block: var(--paper-top) var(--paper-bottom);
	}

	/*
	 * Unfurling out of the hinge, after the sheet has folded into it.
	 *
	 * The delay is the sheet's half of the turn, and `both` holds the panel
	 * edge-on for the length of it. That is what lets the panel be in the
	 * document from the moment of the tap — trap armed, `aria-modal` honoured,
	 * focus already inside — while still being the second thing seen. Nothing
	 * is held back for a keyboard or a screen reader; only the drawing waits.
	 */
	.unfurling {
		animation: unfurl var(--flip) ease-out var(--flip) both;
		will-change: transform;
	}

	/*
	 * Not far enough. It swings upright again — it used to snap.
	 *
	 * Two animations rather than one: the rotation and the axis are on
	 * different clocks, because the axis has to be home before the paper is,
	 * and one keyframe timeline can only be eased one way at a time.
	 */
	.springing {
		animation:
			spring-back var(--flip) var(--inertia) forwards,
			recentre calc(var(--flip) * 0.6) var(--inertia) forwards;
		will-change: transform;
	}

	/*
	 * And back into the hinge. `--turn` is where a finger left the paper, so a
	 * drag that goes far enough hands over to this without a jump; from the ✕
	 * or from Escape it is nought and the turn starts from flat.
	 *
	 * Last of the three deliberately: only one `animation` survives the
	 * cascade, and closing has to be the one that does however the panel was
	 * caught — mid-arrival, or mid-spring under a finger that let go.
	 */
	.furling {
		animation:
			furl var(--flip) ease-in forwards,
			recentre calc(var(--flip) * 0.6) var(--inertia) forwards;
		pointer-events: none;
		will-change: transform;
	}

	/*
	 * One rotation, going round and round the same way.
	 *
	 * Every half-turn is the same movement: the face on its way out leads with
	 * its right edge and goes to edge-on, and the face arriving settles out of
	 * its left. So a swipe rightwards always spins the paper the same way, and
	 * swiping again keeps it spinning rather than winding it back — which is
	 * what a receipt spun in the hand does. Opening and closing look identical
	 * because they are: the paper does not know which side it is on.
	 *
	 * The near edge does change sides across the handover, since the panel's
	 * words are set to be read rather than mirrored. Nothing is seen of it:
	 * both halves are exactly edge-on at that instant. And nothing turns past a
	 * quarter, so no content is ever shown from behind.
	 */
	@keyframes unfurl {
		from {
			--turn: -90deg;
		}
		to {
			--turn: 0deg;
		}
	}

	@keyframes furl {
		from {
			translate: calc(-50% + var(--slide, 0px)) 0;
		}
		to {
			--turn: 90deg;
			translate: -50% 0;
		}
	}

	@keyframes spring-back {
		from {
			translate: calc(-50% + var(--slide, 0px)) 0;
		}
		to {
			--turn: 0deg;
			translate: -50% 0;
		}
	}

	/*
	 * The edges stay put and the content scrolls inside them. Framing the
	 * scrolled content instead leaves the last line hanging outside, because an
	 * absolutely positioned box in a scroll container sizes to the visible box
	 * rather than to what it holds.
	 *
	 * Above the scroller, and this is the fix rather than a nicety. The panel's
	 * own sticky switcher carries an opaque ground the width of the paper, and
	 * painted over the edges it rubbed them out along the row it stuck to; the
	 * scrolled prose behind it did the same to the sides. Paper is in front of
	 * what is written on it.
	 *
	 * The ✕ stays above even this: it is a control, and the edge is scenery.
	 */
	.edges {
		position: absolute;
		inset: 0;
		/*
		 * Above the sticky switcher, which carries a ground of its own at 1 and
		 * is painted later in the document — a tie there goes to the switcher,
		 * which is how the edge was rubbed out in the first place.
		 */
		z-index: 2;
		pointer-events: none;
	}

	/*
	 * The tears sit in the room the panel holds above and below its scroller,
	 * which is `padding-block` below — so the writing is cut off exactly where
	 * the paper is torn, and never halfway through a tooth.
	 */
	.tear-edge {
		position: absolute;
		/*
		 * In by half a side edge from where the sides are, so the tear runs
		 * between the two verticals rather than past them: `--edge` is the
		 * side's box and its stroke runs down the middle of it, so half of that
		 * is where the corner falls.
		 */
		right: calc(var(--paper-x) + var(--edge) / 2);
		left: calc(var(--paper-x) + var(--edge) / 2);
	}

	.tear-edge.top {
		top: var(--paper-top);
	}

	.tear-edge.bottom {
		bottom: var(--paper-bottom);
	}

	/*
	 * The full height of the paper, tears included, which is where the sheet's
	 * own sides run.
	 *
	 * They overhang into the tears and are cut back by the teeth — the same
	 * thing the tear does to the writing that scrolls behind it. Stopped flush
	 * at the tears they ended on a clean horizontal, which is a sheet
	 * guillotined at three edges and torn at the top.
	 */
	.sides {
		position: absolute;
		top: var(--paper-top);
		right: var(--paper-x);
		bottom: var(--paper-bottom);
		left: var(--paper-x);
	}

	/*
	 * The inset belongs to the scrolled content, not to the panel around it.
	 *
	 * Held on the panel it was a margin pretending to be padding: the scroll
	 * box stopped short of the panel's edges, so a line of text vanished two
	 * centimetres before it reached them and reappeared the same distance in.
	 * Text that fades out in the middle of a panel reads as a bug in the panel.
	 *
	 * Here the scroller is the whole panel and the room is its padding, so the
	 * first line starts where it always did, scrolls the full height, and is
	 * cut only at the edge of the paper — which is the one place a cut reads as
	 * the paper ending rather than as the text giving up.
	 */
	.scroll {
		flex: 1 1 auto;
		min-height: 0;
		overflow-y: auto;
		/*
		 * In by the same margin the sheet keeps its writing off its own edges
		 * by, so a line in the panel starts exactly where a task on the sheet
		 * starts. The room above and below belongs to the panel, which is what
		 * makes the frame the thing that clips.
		 */
		padding-inline: calc(var(--paper-x) + var(--paper-inset));
		/*
		 * The tears' own height, held inside the scroll rather than outside it.
		 *
		 * The first line therefore rests where it has always rested — clear of
		 * the teeth — but the room above it scrolls away with it, so the line
		 * passes behind the tear and is cut by the teeth instead of stopping
		 * short of them. Same at the foot.
		 */
		padding-block: var(--tear);
	}

	/*
	 * On the burger, because it is the burger: the button does not move when
	 * the panel opens, it only changes what it is drawn as.
	 *
	 * Simply the paper's own corner now. It used to need a min() of two terms
	 * to chase a centred page from a right-pinned drawer; with the panel laid
	 * out as the same box, there is nothing to chase.
	 */
	.close {
		position: absolute;
		top: var(--corner-y);
		right: var(--corner-x);
		width: var(--touch);
		height: var(--touch);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		/*
		 * Above the content it scrolls over, above the switcher's own sticky
		 * pill — the two share the same row — and above the drawn edges, which
		 * are scenery where this is a control.
		 */
		z-index: 3;
	}

	/*
	 * Three pixels of paper on either side of the stroke, so the mark stays
	 * legible over whatever has been scrolled under it. The stroke is centred on
	 * the path, so it takes six on top of the ink's own width to clear three.
	 *
	 * Drawn under, not over: `.knockout` comes first in the markup and SVG paints
	 * in document order.
	 */
	.knockout {
		stroke: var(--paper);
		stroke-width: calc((var(--stroke) + 6) * 1px);
	}

	/*
	 * No padding-top of its own any more: the switcher's own sticky pill (see
	 * ListSwitcher.svelte) reserves exactly the room the ✕ needs by sitting at
	 * that same offset as ordinary first content, rather than this padding
	 * pushing everything below it clear of a corner control mounted outside
	 * the scroll.
	 */
	.body {
		text-align: center;
	}

	/*
	 * The same header a group has on the sheet: same face, same size, the caps
	 * and their spacing from the shared class — which matters, because TextRule
	 * measures a hidden copy carrying `caps` and a header that spaced its own
	 * letters would be underlined short.
	 *
	 * The bottom margin leaves room for the rule, which pulls itself up under
	 * the words.
	 */
	h2 {
		margin: 2.5rem 0 0;
		font-family: var(--hand);
		font-size: var(--size-title);
		font-weight: 400;
	}

	.headline {
		margin: 0 0 0.25rem;
		font-size: var(--size-title);
		line-height: 1.3;
		transform: rotate(var(--instruction-tilt));
		transform-origin: var(--instruction-origin);
	}

	/*
	 * These two are instructions, not footnotes — the whole point of the panel
	 * is that someone can read what is going on. They stay at body size, and
	 * are set apart by space rather than by being shrunk and dimmed.
	 */
	.detail {
		margin: 0 0 0.5rem;
		font-size: var(--size-title);
		line-height: 1.3;
		transform: rotate(var(--instruction-tilt));
		transform-origin: var(--instruction-origin);
	}

	/* The code is the thing on this panel. It sits in the middle of it. */
	.code {
		/* Room either side: it is read off the screen a character at a time. */
		margin: 1.25rem 0;
		font-family: var(--hand);
		font-size: var(--size-display);
		letter-spacing: 0.08em;
		overflow-wrap: anywhere;
	}

	/* The same room the code above it gets, for the same reason. */
	.body :global(.field) {
		margin-block: 1.25rem;
	}

	.pair {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		margin-bottom: 0.5rem;
	}

	.pair.wrap {
		flex-wrap: wrap;
	}

	/* Still this list, but a different kind of doing to it. */
	.pair.apart {
		margin-top: 1.75rem;
	}

	/*
	 * No h2 comes between this pair and the tear above it, so it takes the
	 * same top margin a heading would have taken — the tear alone is not
	 * what sets a section apart, the room after it is too.
	 */
	.pair.debug {
		margin-top: 2.5rem;
	}

	/*
	 * A drawn box each, rather than an underline and a dot between them. Every
	 * seed is its own, so no two boxes are the same shape — eleven copies of one
	 * rectangle would read as a stamp, which is the thing this app never does.
	 *
	 * A CSS border is not available here: it is a ruled straight line, and
	 * nothing drawn in this app is ruled.
	 */
	.pair button,
	.action {
		position: relative;
		min-height: var(--touch);
		padding: 0.3rem 0.75rem;
	}

	.pair button:disabled {
		cursor: default;
	}

	.nothing {
		opacity: 0.4;
	}

	/* Hyphenated where the word allows it — see `.text` in TaskRow. */
	.note {
		margin: 0.75rem 0 0;
		font-size: var(--size-title);
		line-height: 1.3;
		-webkit-hyphens: auto;
		hyphens: auto;
		transform: rotate(var(--instruction-tilt));
		transform-origin: var(--instruction-origin);
	}

	.action {
		margin-top: 0.75rem;
	}

	/* Dims the box with the words, which is what makes it read as one control. */
	.action:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.ask {
		margin: 1rem 0 0.5rem;
		font-size: var(--size-title);
		line-height: 1.3;
		transform: rotate(var(--instruction-tilt));
		transform-origin: var(--instruction-origin);
	}

	.error {
		margin-top: 1rem;
		font-size: var(--size-title);
		line-height: 1.4;
	}

	/*
	 * Left-aligned against a panel everything else is centred in: this is
	 * read a line at a time, in order, and centring would make every line a
	 * different width to find the start of.
	 */
	/*
	 * A plain CSS border, not a drawn one: this is a technical readout, not a
	 * mark on the sheet, and a dashed rule around it reads as a terminal's own
	 * frame rather than as paper. Monospace for the same reason — a log is
	 * lines of data lining up, not words in a hand.
	 */
	.log {
		margin-top: 1rem;
		padding: 0.75rem;
		border: 1px dashed var(--ink);
		text-align: left;
		max-height: 40vh;
		overflow-y: auto;
	}

	.entry {
		margin: 0 0 0.6rem;
		font-family: var(--mono);
		font-size: calc(var(--size-small) * var(--mono-scale));
		line-height: 1.4;
		overflow-wrap: anywhere;
	}

	.entry:last-child {
		margin-bottom: 0;
	}

	/*
	 * Out to the drawn edge of the paper and no further.
	 *
	 * A section break that stopped short of both margins would be a rule, and a
	 * rule is a different mark — but the frame is where this paper ends, so a
	 * tear running past it reads as a stroke that missed rather than as the
	 * sheet being torn. It takes back exactly what Loose ends takes back on the
	 * sheet, and for the same reason: the margin the writing is held off the
	 * edge by.
	 *
	 * The h2 under it brings its own room, so the space belongs to the line
	 * above rather than being split between the two.
	 */
	.tear {
		margin: 2.5rem calc(-1 * var(--paper-inset)) 0;
	}

	/* The tear above already set this section apart. */
	.tear + h2 {
		margin-top: 2.5rem;
	}

	/*
	 * The tear brings its own room above, so the footer adds none of its own
	 * at the top. It used to open with three asterisks and 3rem of padding;
	 * the mark now spaces itself the way the other two do.
	 *
	 * Below, `.scroll` clips at the paper's own edge — without room here the
	 * credit sits flush against it once someone has scrolled all the way
	 * down, whatever its last line happens to be. One line's own height, at
	 * the credit's own size, so the room below it reads as a line rather
	 * than as a gap that just happens to be there.
	 */
	.credit {
		padding-top: 0;
		margin-bottom: 1.4em;
	}

	.credit p {
		margin: 0;
		font-size: var(--size-title);
		line-height: 1.4;
		overflow-wrap: anywhere;
	}

	/* The last section break, and the same distance under it as over it. */
	.credit .tear {
		margin-bottom: 1.25rem;
	}

	/*
	 * Graphe has one style, so this is the browser's synthetic oblique. With a
	 * single face that is the only italic available.
	 */
	.dedication {
		font-style: italic;
	}
</style>
