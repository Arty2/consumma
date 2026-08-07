<script lang="ts">
	import { untrack } from 'svelte';
	import ConfirmModal from '$lib/components/ConfirmModal.svelte';
	import ImportModal from '$lib/components/ImportModal.svelte';
	import Menu from '$lib/components/Menu.svelte';
	import MenuButton from '$lib/components/MenuButton.svelte';
	import Sheet from '$lib/components/Sheet.svelte';
	import SideEdge from '$lib/components/SideEdge.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import TornEdge from '$lib/components/TornEdge.svelte';
	import { copy, paste } from '$lib/clipboard';
	import { formatCode } from '$lib/crypto/derive';
	import { applyImport } from '$lib/markdown/apply';
	import type { Parsed } from '$lib/markdown/from';
	import { toMarkdown } from '$lib/markdown/to';
	import { sheet } from '$lib/state/doc.svelte';
	import { sync } from '$lib/state/sync.svelte';
	import { ui } from '$lib/state/ui.svelte';

	/*
	 * Nothing sits on the page but the sheet and the one button that opens the
	 * menu. Syncing, sharing, importing, clearing and the credit all live behind
	 * it — the paper carries only what someone wrote on it.
	 *
	 * The menu closes before any panel opens over it. Two focus traps at once is
	 * a keyboard trap, and returning to a menu buried under a confirm is not a
	 * step anyone wants.
	 */
	type Panel = 'menu' | 'import' | 'clear' | 'delete' | null;
	let panel = $state<Panel>(null);
	let pasted = $state<string | null>(null);

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
	<!-- Room above the tear, so the stroke is never clipped by the viewport. -->
	<div class="top">
		<TornEdge seed="top" />
	</div>

	<!--
		The tears close the paper top and bottom; these close it at the sides, so
		it reads as a strip of paper rather than as text on a page.
	-->
	<main data-sheet>
		<SideEdge seed="left" side="left" />
		<SideEdge seed="right" side="right" />

		<div class="corner">
			<MenuButton onopen={() => (panel = 'menu')} />
		</div>
		<Sheet />
	</main>

	<TornEdge seed="bottom" flip />
</div>

{#if panel === 'menu'}
	<Menu
		onclose={() => (panel = null)}
		onimport={onImport}
		onexport={onExportFromMenu}
		onclear={() => (panel = 'clear')}
		ondelete={() => (panel = 'delete')}
	/>
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
		padding: 0 1rem calc(2rem + env(safe-area-inset-bottom));
	}

	.top {
		padding-top: calc(2rem + env(safe-area-inset-top));
	}

	/*
	 * Holds the two side edges, which span whatever the list comes to. The
	 * padding keeps the writing off them — a title running into the edge of the
	 * paper reads as a mistake.
	 */
	main {
		display: block;
		position: relative;
		padding: 0 1.25rem;
	}

	/*
	 * The button sits in the sheet's top-right corner with a row to itself. It
	 * used to be positioned over the sheet, where the first task row covered it
	 * and swallowed the tap.
	 */
	.corner {
		display: flex;
		justify-content: flex-end;
	}
</style>
