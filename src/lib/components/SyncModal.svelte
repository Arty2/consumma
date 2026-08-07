<script lang="ts">
	import Modal from './Modal.svelte';
	import { copy, share } from '$lib/clipboard';
	import { formatCode, normaliseCode } from '$lib/crypto/derive';
	import { handLine } from '$lib/draw/hand';
	import { seedFrom } from '$lib/draw/rng';
	import { sheet } from '$lib/state/doc.svelte';
	import { sync } from '$lib/state/sync.svelte';

	type Props = { onclose: () => void };

	let { onclose }: Props = $props();

	let entered = $state('');
	let joining = $state(false);
	let error = $state<string | null>(null);
	let copied = $state(false);
	let fieldWidth = $state(0);

	/* Drawn, like every other rule in the app — not a CSS border. */
	const fieldRule = $derived(
		fieldWidth > 0 ? handLine(fieldWidth, { seed: seedFrom('join'), wobble: 0.9, y: 2 }) : ''
	);

	const valid = $derived(normaliseCode(entered) !== null);
	/** Joining with tasks already here is never decided silently. */
	const hasLocal = $derived(sheet.taskCount > 0);

	const status = $derived(
		sync.status === 'offline'
			? 'Offline. Changes are saved here.'
			: sync.unsent === 0
				? 'Everything here has been sent.'
				: sync.unsent === 1
					? '1 change has not been sent.'
					: `${sync.unsent} changes have not been sent.`
	);

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
	 * Not forced: the cooldown is the whole reason a second tap costs nothing.
	 * Joining forces, because that is a different request the person has just
	 * asked for.
	 */
	async function syncNow() {
		error = null;
		const outcome = await sync.sync();
		if (outcome && outcome.status !== 'synced') error = sync.message;
	}

	// Nothing else advances the clock, so the cooldown would never clear while
	// the panel is open and looking at it.
	$effect(() => {
		sync.now = Date.now();
		const tick = setInterval(() => (sync.now = Date.now()), 500);
		return () => clearInterval(tick);
	});

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

<Modal title="Sync" seed="sync" {onclose}>
	<div class="panel-body">
		<p class="status">{status}</p>

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

		<h2>This list</h2>

		<p class="code">{sync.code ? formatCode(sync.code) : ''}</p>

		<div class="give">
			<button type="button" class="caps" onclick={onShare}>Share</button>
			<span aria-hidden="true">•</span>
			<button type="button" class="caps" onclick={onCopy}>
				{copied ? 'Copied' : 'Copy'}
			</button>
		</div>

		<p class="note">Anyone with this code can read and change the list.</p>

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
				{sheet.taskCount === 1 ? 'task' : 'tasks'} here. Take them to the other list, or leave them behind?
			</p>
			<div class="choices">
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

		{#if error}
			<p class="error" role="alert">{error}</p>
		{/if}
	</div>
</Modal>

<style>
	.panel-body {
		text-align: center;
	}

	/* A short panel of short lines: it reads as one centred column. */
	.status {
		margin: 0 0 0.5rem;
		line-height: 1.6;
	}

	h2 {
		margin: 2.5rem 0 0.75rem;
		font-family: var(--hand);
		font-size: var(--size-title);
		font-weight: 400;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	/* The code is the thing on this panel. It sits in the middle of it. */
	.code {
		margin: 0;
		font-family: var(--hand);
		font-size: var(--size-display);
		letter-spacing: 0.08em;
		text-align: center;
		overflow-wrap: anywhere;
	}

	.give {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		margin-bottom: 1.5rem;
	}

	.give button {
		min-height: var(--touch);
		padding: 0.5rem;
		text-decoration: underline;
		text-underline-offset: 4px;
	}

	.note {
		margin: 0 0 0.5rem;
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

	.choices {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-wrap: wrap;
		gap: 0.75rem;
	}

	.choices button {
		min-height: var(--touch);
	}

	.error {
		margin-top: 1.5rem;
		line-height: 1.6;
	}
</style>
