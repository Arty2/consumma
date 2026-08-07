<script lang="ts">
	import HandRect from './HandRect.svelte';
	import { trap } from '$lib/a11y/trap';
	import { copy, share } from '$lib/clipboard';
	import { formatCode, normaliseCode } from '$lib/crypto/derive';
	import { handCross, handLine } from '$lib/draw/hand';
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
	let copied = $state(false);
	let fieldWidth = $state(0);

	let panel = $state<HTMLElement | null>(null);
	let offset = $state(0);
	let dragStart: { x: number; at: number } | null = null;

	const cross = $derived(handCross(20, { seed: seedFrom('closemenu'), wobble: 0.8 }));
	const fieldRule = $derived(
		fieldWidth > 0 ? handLine(fieldWidth, { seed: seedFrom('join'), wobble: 0.9, y: 2 }) : ''
	);

	const summary = $derived(statusText(sync.status, sync.unsent));
	const valid = $derived(normaliseCode(entered) !== null);
	/** Joining with tasks already here is never decided silently. */
	const hasLocal = $derived(sheet.taskCount > 0);

	/**
	 * One payload, carrying the link and the code together — either alone is
	 * useless. Built ahead of the click so the share sheet can be opened
	 * synchronously inside the handler.
	 *
	 * The link is bare. The code is never a query parameter or a fragment.
	 */
	const invitation = $derived(
		sync.code
			? `Consumma — a shared checklist.\n${location.origin}\nCode: ${formatCode(sync.code)}`
			: ''
	);

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
		if (outcome && outcome.status !== 'synced') error = sync.message;
	}

	function onShare() {
		share(invitation).then((result) => {
			if (result === 'copied') copied = true;
		});
	}

	async function onCopy() {
		copied = await copy(invitation);
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
				class="caps action"
				disabled={sync.busy || sync.cooling}
				onclick={syncNow}
			>
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

			<h2>This list</h2>

			<p class="code">{sync.code ? formatCode(sync.code) : ''}</p>

			<div class="pair">
				<button type="button" class="caps" onclick={onShare}>Share</button>
				<span aria-hidden="true">•</span>
				<button type="button" class="caps" onclick={onCopy}>
					{copied ? 'Copied' : 'Copy'}
				</button>
			</div>

			<p class="note">Anyone with this code can read and change the list.</p>

			<div class="pair apart">
				<button type="button" class="caps" onclick={onimport}>Import</button>
				<span aria-hidden="true">•</span>
				<button type="button" class="caps" onclick={onexport}>Export</button>
			</div>

			<!-- The only two that take something away, and both stop and ask. -->
			<div class="pair">
				<button
					type="button"
					class="caps"
					class:nothing={sheet.doneCount === 0}
					disabled={sheet.doneCount === 0}
					onclick={onclear}
				>
					Clear
				</button>
				<span aria-hidden="true">•</span>
				<button type="button" class="caps" onclick={ondelete}>Delete</button>
			</div>

			<h2>Join another list</h2>

			<label class="field">
				<span class="sr-only">Code</span>
				<input
					type="text"
					inputmode="text"
					autocomplete="off"
					autocapitalize="off"
					spellcheck="false"
					placeholder="0000 0000 0000"
					bind:value={entered}
				/>
				<svg class="rule" bind:clientWidth={fieldWidth} aria-hidden="true">
					{#if fieldRule}
						<path d={fieldRule} class="drawn drawn--dashed" />
					{/if}
				</svg>
			</label>

			{#if joining}
				<!-- Ask whether to merge or discard. Never decide silently. -->
				<p class="ask">
					You have {sheet.taskCount}
					{sheet.taskCount === 1 ? 'task' : 'tasks'} here. Take them to the other list, or leave them
					behind?
				</p>
				<div class="pair wrap">
					<button type="button" class="caps" onclick={() => join(true)}>Take them</button>
					<span aria-hidden="true">•</span>
					<button type="button" class="caps" onclick={() => join(false)}>Leave them</button>
					<span aria-hidden="true">•</span>
					<button type="button" class="caps" onclick={() => (joining = false)}>Cancel</button>
				</div>
			{:else}
				<button
					type="button"
					class="caps action"
					disabled={!valid || sync.busy}
					onclick={() => (hasLocal ? (joining = true) : join(false))}
				>
					Join
				</button>
			{/if}

			<footer class="credit">
				<p class="break" aria-hidden="true">* * *</p>
				<p>v{__VERSION__} • heracl.es/consumma</p>
				<p class="dedication">Dialectic Acheropoieton of Heracles Papatheodorou and Claude</p>
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

	h2 {
		margin: 2.5rem 0 0.75rem;
		font-family: var(--hand);
		font-size: var(--size-title);
		font-weight: 400;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.headline {
		margin: 0 0 0.25rem;
		line-height: 1.6;
	}

	/*
	 * These two are instructions, not footnotes — the whole point of the panel
	 * is that someone can read what is going on. They stay at body size, and
	 * are set apart by space rather than by being shrunk and dimmed.
	 */
	.detail {
		margin: 0 0 0.5rem;
		line-height: 1.6;
	}

	/* The code is the thing on this panel. It sits in the middle of it. */
	.code {
		margin: 0;
		font-family: var(--hand);
		font-size: var(--size-display);
		letter-spacing: 0.08em;
		overflow-wrap: anywhere;
	}

	.pair {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		margin-bottom: 0.5rem;
	}

	.pair.wrap {
		flex-wrap: wrap;
	}

	/* Still this list, but a different kind of doing to it. */
	.pair.apart {
		margin-top: 1.75rem;
	}

	.pair button {
		min-height: var(--touch);
		padding: 0.5rem;
		text-decoration: underline;
		text-underline-offset: 4px;
	}

	.pair button:disabled {
		cursor: default;
		text-decoration: none;
	}

	.nothing {
		opacity: 0.4;
	}

	.note {
		margin: 0.75rem 0 0;
		line-height: 1.6;
	}

	/* As wide as the code it is a field for, and centred under it. */
	.field {
		display: block;
		max-width: 15rem;
		margin: 0 auto;
	}

	.field input {
		width: 100%;
		min-height: var(--touch);
		padding: 0.25rem 0;
		font-family: var(--hand);
		font-size: var(--size-title);
		letter-spacing: 0.06em;
		text-align: center;
	}

	.field .rule {
		display: block;
		width: 100%;
		height: 5px;
		margin-top: -0.35rem;
		overflow: visible;
	}

	.action {
		min-height: var(--touch);
		padding: 0.5rem 1rem;
		margin-top: 0.5rem;
		text-decoration: underline;
		text-underline-offset: 4px;
	}

	.action:disabled {
		opacity: 0.4;
		cursor: default;
		text-decoration: none;
	}

	.ask {
		margin: 1rem 0 0.5rem;
		line-height: 1.6;
	}

	.error {
		margin-top: 1rem;
		line-height: 1.6;
	}

	.credit {
		padding-top: 3rem;
	}

	.credit p {
		margin: 0;
		font-size: var(--size-small);
		line-height: 1.7;
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
