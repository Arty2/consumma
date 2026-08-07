<script lang="ts">
	import ConfirmModal from '$lib/components/ConfirmModal.svelte';
	import ImportModal from '$lib/components/ImportModal.svelte';
	import Sheet from '$lib/components/Sheet.svelte';
	import ShareModal from '$lib/components/ShareModal.svelte';
	import StatusMark from '$lib/components/StatusMark.svelte';
	import SyncModal from '$lib/components/SyncModal.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import TornEdge from '$lib/components/TornEdge.svelte';
	import { copy, paste, share } from '$lib/clipboard';
	import { formatCode } from '$lib/crypto/derive';
	import { applyImport } from '$lib/markdown/apply';
	import type { Parsed } from '$lib/markdown/from';
	import { toMarkdown } from '$lib/markdown/to';
	import { sheet } from '$lib/state/doc.svelte';
	import { sync } from '$lib/state/sync.svelte';
	import { ui } from '$lib/state/ui.svelte';

	/*
	 * The page opens scrolled so the torn top edge sits at the top of the
	 * viewport and SYNC · SHARE is just above it, out of sight. The app opens on
	 * the list, not on its controls.
	 *
	 * The controls stay first in the DOM, so tabbing to them scrolls them into
	 * view naturally — hidden is not the same as unreachable.
	 */
	let top = $state<HTMLElement | null>(null);
	let settled = false;

	/** Never more than one at a time, and a modal never opens another. */
	type Panel = 'sync' | 'share' | 'import' | 'clear' | 'delete' | null;
	let panel = $state<Panel>(null);
	let pasted = $state<string | null>(null);

	$effect(() => {
		sheet.load();
		ui.load();
		sync.load();
	});

	// The mark has to change when the document does.
	$effect(() => {
		void sheet.doc;
		sync.refresh();
	});

	$effect(() => {
		if (settled || !top) return;
		settled = true;

		history.scrollRestoration = 'manual';
		// Jump, never smooth-scroll, and never again: if someone has scrolled up
		// to reach SYNC, a re-render must not yank them back down.
		requestAnimationFrame(() => {
			top?.scrollIntoView({ block: 'start', behavior: 'instant' });
		});
	});

	function openSync() {
		panel = 'sync';
		top?.scrollIntoView({ block: 'start', behavior: 'instant' });
	}

	/*
	 * navigator.share must be called synchronously inside the click handler,
	 * before any await — deriving a string first throws NotAllowedError. The
	 * modal opens once the share promise settles, either way.
	 */
	function onShare() {
		const code = sync.code;
		if (!code) return;

		const text = `Join my list on Consumma. Code: ${code}`;
		// The bare front page. The code never goes in the URL.
		share(text, location.origin).then((result) => {
			if (result === 'copied') ui.say('Copied the code.');
			panel = 'share';
		});
	}

	async function onExport() {
		const markdown = toMarkdown(sheet.doc);
		if (markdown === '') {
			ui.say('Nothing to copy yet.');
			return;
		}

		const count = sheet.taskCount;
		const ok = await copy(markdown);
		ui.say(ok ? `Copied ${count} ${count === 1 ? 'task' : 'tasks'}.` : 'Couldn’t copy.');
	}

	async function onImport() {
		pasted = await paste();
		panel = 'import';
	}

	function applyMarkdown(parsed: Parsed, mode: 'add' | 'replace') {
		const ctx = sheet.ctx;
		if (!ctx) return;

		const result = applyImport(sheet.doc, ctx, parsed, mode);
		panel = null;

		if (result.refused === 'tasks') {
			ui.say('That would go over 100 tasks — clear some first.');
			return;
		}
		if (result.refused === 'groups') {
			ui.say('That would go over 20 groups.');
			return;
		}

		sheet.replace(result.doc);
		ui.say(
			result.skipped > 0
				? `Added ${result.added}, skipped ${result.skipped} already there.`
				: `Added ${result.added}.`
		);
	}

	function onClear() {
		panel = null;
		const cleared = sheet.clearDone();
		if (cleared.length === 0) return;

		// The confirm stops the accident; the undo covers the change of mind.
		ui.say(`Cleared ${cleared.length}.`, () => {
			sheet.restore(cleared);
			ui.dismiss();
		});
	}

	function onDelete() {
		panel = null;
		sync.forget();
		ui.say('Removed from this device.');
	}
</script>

<div class="page">
	<nav class="above" aria-label="Sharing">
		<button type="button" class="caps" onclick={openSync}>SYNC</button>
		<span aria-hidden="true">·</span>
		<button type="button" class="caps" onclick={onShare}>SHARE</button>
	</nav>

	<div bind:this={top}>
		<TornEdge seed="top" />
	</div>

	<main data-sheet>
		<div class="corner">
			<StatusMark onopen={openSync} />
		</div>
		<Sheet />
	</main>

	<TornEdge seed="bottom" flip />

	<nav class="below" aria-label="The list">
		<button type="button" class="caps" onclick={onImport}>IMPORT</button>
		<span aria-hidden="true">·</span>
		<button type="button" class="caps" onclick={onExport}>EXPORT</button>
	</nav>

	<!-- The only two that take something away, and both stop and ask. -->
	<nav class="below last" aria-label="Removing things">
		<button type="button" class="caps" onclick={() => (panel = 'delete')}>DELETE</button>
		<span aria-hidden="true">·</span>
		<button
			type="button"
			class="caps"
			class:nothing={sheet.doneCount === 0}
			disabled={sheet.doneCount === 0}
			onclick={() => (panel = 'clear')}
		>
			CLEAR
		</button>
	</nav>
</div>

{#if panel === 'sync'}
	<SyncModal onclose={() => (panel = null)} />
{:else if panel === 'share' && sync.code}
	<ShareModal code={sync.code} onclose={() => (panel = null)} />
{:else if panel === 'import'}
	<ImportModal initial={pasted} onapply={applyMarkdown} onclose={() => (panel = null)} />
{:else if panel === 'clear'}
	<ConfirmModal
		title="Clear completed tasks"
		seed="clear"
		confirmLabel="Clear"
		onconfirm={onClear}
		oncancel={() => (panel = null)}
	>
		Remove {sheet.doneCount} completed {sheet.doneCount === 1 ? 'task' : 'tasks'}? They go for
		everyone on this list, the next time you sync.
	</ConfirmModal>
{:else if panel === 'delete'}
	<ConfirmModal
		title="Remove this list from this device"
		seed="delete"
		confirmLabel="Delete"
		onconfirm={onDelete}
		oncancel={() => (panel = null)}
	>
		This removes the list from this phone. Everyone else keeps it. To come back you'll need the code
		— {sync.code ? formatCode(sync.code) : ''}. This is the last screen it exists on.
		{#if sync.unsent > 0}
			You have {sync.unsent}
			{sync.unsent === 1 ? 'change' : 'changes'} that never reached anyone else; those go too.
		{/if}
	</ConfirmModal>
{/if}

<Toast />

<style>
	.page {
		max-width: 34rem;
		margin: 0 auto;
		padding: 0 1rem;
	}

	/*
	 * The mark sits in the sheet's top-right corner with a row to itself. It
	 * used to be positioned over the sheet, where the first task row covered it
	 * and swallowed the tap.
	 */
	.corner {
		display: flex;
		justify-content: flex-end;
	}

	nav {
		display: flex;
		align-items: center;
		justify-content: center;
		/* Every action row fits one line at 320px, so none wraps. */
		flex-wrap: nowrap;
		gap: 0.5rem;
		min-height: var(--touch);
	}

	.above {
		padding-top: calc(1rem + env(safe-area-inset-top));
		padding-bottom: 1rem;
	}

	.below {
		padding-top: 1.25rem;
	}

	.last {
		padding-bottom: calc(1.5rem + env(safe-area-inset-bottom));
	}

	nav button {
		padding: 0.5rem;
		min-height: var(--touch);
		white-space: nowrap;
	}

	nav button:disabled {
		opacity: 0.4;
		cursor: default;
	}

	/* Drawn with a dashed outline when nothing is done. */
	.nothing {
		opacity: 0.4;
	}
</style>
