<script lang="ts">
	import CodeField from './CodeField.svelte';
	import HandRect from './HandRect.svelte';
	import TextRule from './TextRule.svelte';
	import { trap } from '$lib/a11y/trap';
	import { copy, share } from '$lib/clipboard';
	import { formatCode, normaliseCode } from '$lib/crypto/derive';
	import { handCross } from '$lib/draw/hand';
	import { seedFrom } from '$lib/draw/rng';
	import { sheet } from '$lib/state/doc.svelte';
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

	const cross = $derived(handCross(20, { seed: seedFrom('closemenu'), wobble: 0.8 }));

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
		<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
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

			<h2 class="caps">This list</h2>
			<TextRule text="This list" seed="thislist" centred />

			<p class="code">{sync.code ? formatCode(sync.code) : ''}</p>

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

			<footer class="credit">
				<p class="break" aria-hidden="true">* * *</p>
				<p>v{__VERSION__} • heracl.es/consumma</p>
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
	.menu {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		width: min(24rem, 100%);
		z-index: 10;
		background: var(--paper);
		padding: calc(2rem + env(safe-area-inset-top)) 1.75rem calc(2rem + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
		outline: none;
		touch-action: pan-y;
		translate: var(--offset, 0);
	}

	/*
	 * The frame is the drawer's edge and stays put; the content scrolls inside
	 * it. Framing the scrolled content instead leaves the last line hanging
	 * outside the border, because an absolutely positioned box in a scroll
	 * container sizes to the visible box rather than to what it holds.
	 */
	.frame {
		position: absolute;
		inset: 0.75rem;
		pointer-events: none;
	}

	.scroll {
		flex: 1 1 auto;
		min-height: 0;
		overflow-y: auto;
	}

	.close {
		position: absolute;
		top: calc(1.1rem + env(safe-area-inset-top));
		right: 1.1rem;
		width: var(--touch);
		height: var(--touch);
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	.body {
		padding-top: 1.5rem;
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

	.credit {
		padding-top: 3rem;
	}

	.credit p {
		margin: 0;
		font-size: var(--size-title);
		line-height: 1.4;
		overflow-wrap: anywhere;
	}

	.credit .break {
		margin: 0 0 1.25rem;
		letter-spacing: 0.3em;
		/* The letter-spacing hangs off the last asterisk; pull the row back. */
		text-indent: 0.3em;
	}

	/*
	 * Graphe has one style, so this is the browser's synthetic oblique. With a
	 * single face that is the only italic available.
	 */
	.dedication {
		font-style: italic;
	}
</style>
