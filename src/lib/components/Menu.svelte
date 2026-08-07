<script lang="ts">
	import CodeField from './CodeField.svelte';
	import Panel from './Panel.svelte';
	import { copy, share } from '$lib/clipboard';
	import { formatCode, normaliseCode } from '$lib/crypto/derive';
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

	const summary = $derived(statusText(sync.status, sync.unsent, refused));
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

	/*
	 * A second hand, and only while there is a second hand to watch: the cooldown
	 * counts down in the SYNC NOW label, and nothing else here is per-second.
	 * SyncButton owns the slow tick that the ten-minute staleness needs.
	 *
	 * `now` is written and never read here. An effect that does both never
	 * settles, and takes the whole tree's reactivity down with it.
	 */
	$effect(() => {
		if (!sync.cooling) return;

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
</script>

<Panel title="Menu" seed="menu" axis="x" {onclose}>
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

			<CodeField bind:value={entered} label="Code" />

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
				<p class="dedication">
					Dialectic Acheropoieton<br />of Heracles Papatheodorou and Claude
				</p>
			</footer>
		</div>
	</div>
</Panel>

<style>
	.scroll {
		flex: 1 1 auto;
		min-height: 0;
		overflow-y: auto;
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
