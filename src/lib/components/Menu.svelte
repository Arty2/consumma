<script lang="ts">
	import CodeField from './CodeField.svelte';
	import HandRect from './HandRect.svelte';
	import Perforation from './Perforation.svelte';
	import TextRule from './TextRule.svelte';
	import { trap } from '$lib/a11y/trap';
	import { copy, share } from '$lib/clipboard';
	import { formatCode, normaliseCode } from '$lib/crypto/derive';
	import { handCross } from '$lib/draw/hand';
	import { seedFrom } from '$lib/draw/rng';
	import { diagnostics } from '$lib/state/diagnostics.svelte';
	import { sheet } from '$lib/state/doc.svelte';
	import { lists } from '$lib/state/lists.svelte';
	import { sync } from '$lib/state/sync.svelte';
	import { statusText } from '$lib/sync/status';

	/*
	 * Everything that is not the list itself. The sheet keeps only what someone
	 * wrote on it; syncing, sharing, importing, clearing and the credit all live
	 * behind the one button in the corner.
	 *
	 * It comes in from the right and covers the page rather than dimming it —
	 * a scrim means grey, and grey does not exist here.
	 */

	type Props = {
		onclose: () => void;
		onimport: () => void;
		onexport: () => void;
		onclear: () => void;
		ondelete: () => void;
	};

	let { onclose, onimport, onexport, onclear, ondelete }: Props = $props();

	let entered = $state('');
	let joining = $state(false);
	let error = $state<string | null>(null);
	/** Set when the server answered and said no, which is not being offline. */
	let refused = $state(false);
	let copied = $state(false);

	let panel = $state<HTMLElement | null>(null);
	let offset = $state(0);
	let dragStart: { x: number; at: number } | null = null;
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

	/*
	 * The switcher pill only ever appears once a second list exists, so this
	 * is where that second list is made — the only place reachable while
	 * there is still just the one. Once it exists, the pill's own "+ New
	 * list" row calls the same function.
	 */
	function onNewList() {
		lists.createList();
		onclose();
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
		onclose();
	}

	/* Rightwards only: the menu came from there and goes back the same way. */
	function onpointerdown(event: PointerEvent) {
		if (event.button !== 0) return;
		if ((event.target as HTMLElement).closest('input, textarea, button')) return;
		dragStart = { x: event.clientX, at: performance.now() };
	}

	function onpointermove(event: PointerEvent) {
		if (!dragStart) return;
		offset = Math.max(0, event.clientX - dragStart.x);
	}

	function onpointerup(event: PointerEvent) {
		if (!dragStart || !panel) return;

		const travelled = event.clientX - dragStart.x;
		const elapsed = performance.now() - dragStart.at;
		const flick = travelled > 40 && elapsed < 250;

		dragStart = null;

		if (flick || travelled > panel.clientWidth * 0.25) onclose();
		else offset = 0; // Springs back.
	}
</script>

<div
	class="menu"
	role="dialog"
	aria-modal="true"
	aria-label="Menu"
	tabindex="-1"
	bind:this={panel}
	style:--offset="{offset}px"
	use:trap={onclose}
	{onpointerdown}
	{onpointermove}
	{onpointerup}
	onpointercancel={() => {
		dragStart = null;
		offset = 0;
	}}
>
	<div class="frame" aria-hidden="true">
		<HandRect seed="menu" wobble={2.2} />
	</div>

	<button class="close" type="button" onclick={onclose} aria-label="Close">
		<svg viewBox="0 0 {CLOSE} {CLOSE}" width={CLOSE} height={CLOSE} aria-hidden="true">
			<path d={cross} class="drawn" />
		</svg>
	</button>

	<div class="scroll">
		<div class="body">
			<!--
				Two sentences, never one. How much is waiting is what people want to
				know; whether the list could be reached is a condition, not a failure,
				and folding it into the same line made "Offline" read like an error.
			-->
			<p class="headline">{summary.headline}</p>
			{#if summary.detail}
				<p class="detail">{summary.detail}</p>
			{/if}

			<button
				type="button"
				class="caps boxed action"
				disabled={sync.busy || sync.cooling}
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

			<div class="pair">
				<button type="button" class="caps boxed" onclick={onNewList}>
					<HandRect seed="btnnewlist" wobble={1.4} radius={3} />
					New list
				</button>
			</div>

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
					Delete
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
	 * Centred like the page, so the drag-to-dismiss offset is composed with the
	 * centring rather than replacing it.
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
		translate: calc(-50% + var(--offset, 0px)) 0;
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
		/* Above the content it scrolls over. */
		z-index: 1;
	}

	/*
	 * Clear of the ✕, which sits lower than it used to now that it stands where
	 * the burger stands.
	 */
	/*
	 * Clear of the ✕, which stands a tear's height below the paper's top edge
	 * and is a touch target tall. Derived rather than guessed, so it follows
	 * the corner it is avoiding.
	 */
	.body {
		padding-top: calc(var(--tear) + var(--touch));
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

	.note {
		margin: 0.75rem 0 0;
		font-size: var(--size-title);
		line-height: 1.4;
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
