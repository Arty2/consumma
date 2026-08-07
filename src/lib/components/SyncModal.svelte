<script lang="ts">
	import Modal from './Modal.svelte';
	import { formatCode, normaliseCode } from '$lib/crypto/derive';
	import { sheet } from '$lib/state/doc.svelte';
	import { sync } from '$lib/state/sync.svelte';

	type Props = { onclose: () => void };

	let { onclose }: Props = $props();

	let entered = $state('');
	let joining = $state(false);
	let error = $state<string | null>(null);

	const valid = $derived(normaliseCode(entered) !== null);
	/** Joining with tasks already here is never decided silently. */
	const hasLocal = $derived(sheet.taskCount > 0);

	const status = $derived(
		sync.status === 'offline'
			? 'Offline. Your changes are saved here.'
			: sync.unsent === 0
				? 'Everything here has been sent.'
				: sync.unsent === 1
					? '1 change has not been sent.'
					: `${sync.unsent} changes have not been sent.`
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
	<p class="status">{status}</p>

	<button type="button" class="caps action" disabled={sync.busy || sync.cooling} onclick={syncNow}>
		{#if sync.busy}
			Syncing…
		{:else if sync.cooling}
			Sync now ({sync.coolingFor})
		{:else}
			Sync now
		{/if}
	</button>

	<h2>This device</h2>
	<p class="code">{sync.code ? formatCode(sync.code) : ''}</p>

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
	</label>

	{#if joining}
		<!-- Ask whether to merge or discard. Never decide silently. -->
		<p class="ask">
			You have {sheet.taskCount}
			{sheet.taskCount === 1 ? 'task' : 'tasks'} here. Take them to the other list, or leave them behind?
		</p>
		<div class="choices">
			<button type="button" class="caps" onclick={() => join(true)}>Take them</button>
			<span aria-hidden="true">·</span>
			<button type="button" class="caps" onclick={() => join(false)}>Leave them</button>
			<span aria-hidden="true">·</span>
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
</Modal>

<style>
	.status {
		margin: 0 0 1rem;
		line-height: 1.6;
	}

	h2 {
		margin: 2rem 0 0.5rem;
		font-family: var(--display);
		font-size: var(--size-title);
		font-weight: 400;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.code {
		margin: 0;
		font-family: var(--display);
		font-size: var(--size-display);
		letter-spacing: 0.06em;
		overflow-wrap: anywhere;
	}

	.field input {
		width: 100%;
		min-height: var(--touch);
		padding: 0.25rem 0;
		border-bottom: 1px dashed var(--ink);
		font-family: var(--display);
		font-size: var(--size-title);
		letter-spacing: 0.06em;
	}

	.action {
		min-height: var(--touch);
		padding: 0.5rem 0;
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
