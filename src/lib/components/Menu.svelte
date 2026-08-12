<script lang="ts">
	import { browser } from '$app/environment';
	import CodeField from './CodeField.svelte';
	import HandRect from './HandRect.svelte';
	import ListSwitcher from './ListSwitcher.svelte';
	import Perforation from './Perforation.svelte';
	import TextRule from './TextRule.svelte';
	import { trap } from '$lib/a11y/trap';
	import { copy, share } from '$lib/clipboard';
	import { formatCode, normaliseCode } from '$lib/crypto/derive';
	import { handCross } from '$lib/draw/hand';
	import { seedFrom } from '$lib/draw/rng';
	import { diagnostics } from '$lib/state/diagnostics.svelte';
	import { sheet } from '$lib/state/doc.svelte';
	import { sync } from '$lib/state/sync.svelte';
	import { statusText } from '$lib/sync/status';
	import { angleAt, axisAt, commits } from '$lib/turn';

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
	 * tap on the ✕, would otherwise restart the turn from the top.
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
	/*
	 * How far the paper has been turned back by a finger, in degrees. A drag is
	 * the same gesture as the animation now — the panel is the back of a sheet
	 * and pulling it rightwards turns it over, rather than sliding it off to one
	 * side as though there were somewhere beside the paper for it to go.
	 */
	let turn = $state(0);
	/** Where the axis has been pushed to, as a percentage across the paper. */
	let axis = $state(50);
	/** Swinging home after a drag that did not go far enough to close. */
	let springing = $state(false);
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
	 * The same size as the burger it stands in for. This is the one control that
	 * is drawn twice — closed it is three strokes, open it is two — and it has to
	 * read as one button being looked at from either side, so it keeps the
	 * burger's size as well as its place.
	 */
	const CLOSE = 22;

	const cross = $derived(handCross(CLOSE, { seed: seedFrom('closemenu'), wobble: 0.8 }));

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
	 * quarter-turn that takes it edge-on. The thresholds below are unchanged —
	 * it is what they are measured against that moved.
	 */
	function onpointerdown(event: PointerEvent) {
		if (event.button !== 0 || closing) return;
		if ((event.target as HTMLElement).closest('input, textarea, button')) return;

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
		 * The gesture belongs to the panel until the finger lifts, wherever the
		 * paper has got to by then.
		 *
		 * Turning it takes it out from under the hand — that is what turning it
		 * means — and without this the pointer events go to whatever is under
		 * the finger instead, which partway through a turn is the sheet behind.
		 * The move stops being seen and the release is never heard, so the paper
		 * hangs at the angle it had reached. Not a fault of the axis, but the
		 * middle turns both halves away and finds it every time.
		 */
		panel?.setPointerCapture(event.pointerId);

		dragStart = { x: event.clientX, at: performance.now() };
	}

	function onpointermove(event: PointerEvent) {
		if (!dragStart || !panel) return;
		const travelled = event.clientX - dragStart.x;
		// Positive: right edge away, left edge towards the reader, which is the
		// way this half of the turn goes.
		turn = angleAt(travelled, panel.clientWidth, 1);
		axis = axisAt(travelled, panel.clientWidth);
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
		if (commits(travelled, elapsed, panel.clientWidth)) close();
		else if (turn > 0) springing = true;
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
	bind:this={panel}
	use:trap={close}
	{onpointerdown}
	{onpointermove}
	{onpointerup}
	onpointercancel={() => {
		dragStart = null;
		if (turn > 0 && !closing) springing = true;
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
		} else entering = false;
	}}
>
	<div class="frame" aria-hidden="true">
		<HandRect seed="menu" wobble={2.2} />
	</div>

	<button class="close" type="button" onclick={close} aria-label="Close">
		<svg viewBox="0 0 {CLOSE} {CLOSE}" width={CLOSE} height={CLOSE} aria-hidden="true">
			<path d={cross} class="drawn" />
		</svg>
	</button>

	<div class="scroll">
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
		display: flex;
		flex-direction: column;
		outline: none;
		touch-action: pan-y;
		translate: -50% 0;

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
		transform: perspective(1200px) rotateY(var(--turn, 0deg));
		/*
		 * The paper's own top and bottom, so the scroller inside is exactly the
		 * frame's box and the content is cut where the paper stops. Cut at the
		 * viewport instead, a button halfway out of the panel went on being
		 * drawn in the margin below the drawn edge, which reads as the panel
		 * leaking rather than as paper ending.
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
			spring-back var(--flip) ease-out forwards,
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
	 * The angles a real sheet's back face passes through, which are the front's
	 * reflected — so the two halves together are one rotation carrying on in one
	 * direction, rather than the paper folding to edge-on and opening back out
	 * the way it came.
	 *
	 * Closing, the panel's left edge swings towards the reader and its right
	 * goes back; the sheet then arrives right-edge-first out of the same turn.
	 * Opening is that run backwards. Either way the paper keeps going round
	 * instead of changing its mind at the join, which is what a receipt turned
	 * over in the hand does.
	 *
	 * The cost is that the near edge changes sides across the handover, since
	 * the panel's words are set to be read rather than mirrored. Nothing is
	 * seen of it: both halves are exactly edge-on at that instant. And nothing
	 * turns past a quarter, so no content is ever shown from behind.
	 */
	@keyframes unfurl {
		from {
			transform: perspective(1200px) rotateY(90deg);
		}
		to {
			transform: perspective(1200px) rotateY(0deg);
		}
	}

	@keyframes furl {
		from {
			transform: perspective(1200px) rotateY(var(--turn, 0deg));
		}
		to {
			transform: perspective(1200px) rotateY(90deg);
		}
	}

	@keyframes spring-back {
		from {
			transform: perspective(1200px) rotateY(var(--turn, 0deg));
		}
		to {
			transform: perspective(1200px) rotateY(0deg);
		}
	}

	/*
	 * The frame is the drawer's edge and stays put; the content scrolls inside
	 * it. Framing the scrolled content instead leaves the last line hanging
	 * outside the border, because an absolutely positioned box in a scroll
	 * container sizes to the visible box rather than to what it holds.
	 */
	/*
	 * On the sheet's own drawn edges: the room beside the paper across, and the
	 * room the tears leave above and below. The sheet closes itself with two
	 * torn edges and two side edges; the panel closes itself with one drawn
	 * box, in the same place.
	 */
	.frame {
		position: absolute;
		top: var(--paper-top);
		right: var(--paper-x);
		bottom: var(--paper-bottom);
		left: var(--paper-x);
		pointer-events: none;
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
		 * Above the content it scrolls over, and above the switcher's own
		 * sticky pill too — the two share the same row, and without this the
		 * pill, painted later in the document, would win the tie.
		 */
		z-index: 2;
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
		line-height: 1.4;
	}

	/*
	 * These two are instructions, not footnotes — the whole point of the panel
	 * is that someone can read what is going on. They stay at body size, and
	 * are set apart by space rather than by being shrunk and dimmed.
	 */
	.detail {
		margin: 0 0 0.5rem;
		font-size: var(--size-title);
		line-height: 1.4;
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
		line-height: 1.4;
		-webkit-hyphens: auto;
		hyphens: auto;
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
		line-height: 1.4;
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
