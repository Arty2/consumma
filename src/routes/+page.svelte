<script lang="ts">
	import { untrack } from 'svelte';
	import ConfirmModal from '$lib/components/ConfirmModal.svelte';
	import ImportModal from '$lib/components/ImportModal.svelte';
	import ListSwitcher from '$lib/components/ListSwitcher.svelte';
	import Menu from '$lib/components/Menu.svelte';
	import MenuButton from '$lib/components/MenuButton.svelte';
	import Sheet from '$lib/components/Sheet.svelte';
	import SideEdge from '$lib/components/SideEdge.svelte';
	import SyncButton from '$lib/components/SyncButton.svelte';
	import ThemeButton from '$lib/components/ThemeButton.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import TornEdge from '$lib/components/TornEdge.svelte';
	import { copy, paste } from '$lib/clipboard';
	import { formatCode } from '$lib/crypto/derive';
	import { applyImport } from '$lib/markdown/apply';
	import type { Parsed } from '$lib/markdown/from';
	import { toMarkdown } from '$lib/markdown/to';
	import { diagnostics } from '$lib/state/diagnostics.svelte';
	import { sheet } from '$lib/state/doc.svelte';
	import { lists } from '$lib/state/lists.svelte';
	import { sync } from '$lib/state/sync.svelte';
	import { ui } from '$lib/state/ui.svelte';

	/*
	 * Nothing sits on the page but the sheet and the buttons in its corners.
	 * Syncing, sharing, importing, clearing and the credit all live behind the
	 * one that opens the menu — the paper carries only what someone wrote on it.
	 *
	 * The theme sits beside it rather than inside it, because it is the one
	 * setting whose result is the screen itself: a control for how the sheet
	 * looks, buried under a panel that covers the sheet, cannot be seen working.
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
			/*
			 * lists.load() restores whichever list was open last and points
			 * sheet/sync/ui at it, which marks their own `loaded` the same way
			 * calling them directly would — so on a device that remembers more
			 * than one list, the three calls below are already no-ops by the
			 * time they run. On a device with just the one, lists.load() finds
			 * no index and does nothing, leaving these three to load exactly as
			 * they always have.
			 */
			diagnostics.load();
			lists.load();
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
		lists.deleteCurrent();
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

		<!--
			Sync on its own at the left, because it is the one that comes and goes;
			the switcher sits between it and the two that are always there, which
			stay together on the right, where the thumb already knows to find the
			burger. Only ever here once there is a second list to choose between —
			see ListSwitcher.
		-->
		<div class="corner">
			<SyncButton />
			<ListSwitcher />
			<div class="controls">
				<ThemeButton />
				<MenuButton onopen={() => (panel = 'menu')} />
			</div>
		</div>
		<!--
			Keyed on which list is open, so a row a task was being typed into, or a
			drag in progress, does not survive into another list's markup — Sheet's
			own state (the new-group draft, the open caret) belongs to the list it
			was opened on, not to the component instance.
		-->
		{#key lists.current}
			<Sheet />
		{/key}
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
		confirmLabel="Leave"
		onconfirm={onDelete}
		oncancel={() => (panel = null)}
	>
		{#if sync.code}
			This removes the list from this phone. Everyone else keeps it. To come back you'll need the
			code — {formatCode(sync.code)}. This is the last screen it exists on.
			{#if sync.unsent > 0}
				You have {sync.unsent}
				{sync.unsent === 1 ? 'change' : 'changes'} that never reached anyone else; those go too.
			{/if}
		{:else}
			<!--
				Never synced, so there is no code to write down and nobody else holding
				a copy. Offering one last look at a code would be offering nothing.
			-->
			This list has never been synced, so it is nowhere but here. Removing it removes all of it, and there
			is no code to come back with.
		{/if}
	</ConfirmModal>
{/if}

<Toast />

<style>
	/*
	 * The paper's own box, and the menu is laid out from the same variables —
	 * the panel is the back of this sheet, not a drawer beside it. See app.css.
	 */
	.page {
		max-width: var(--paper-width);
		margin: 0 auto;
		padding: 0 var(--paper-x) var(--paper-bottom);
	}

	.top {
		padding-top: var(--paper-top);
	}

	/*
	 * Holds the two side edges, which span whatever the list comes to. The
	 * padding keeps the writing off them — a title running into the edge of the
	 * paper reads as a mistake.
	 */
	main {
		display: block;
		position: relative;
		padding: 0 var(--paper-inset);
	}

	/*
	 * The buttons sit in the sheet's top corners with a row to themselves. They
	 * used to be positioned over the sheet, where the first task row covered
	 * them and swallowed the tap. The switcher, when there is one, rides the
	 * same row between sync and the pair on the right, rather than a row of
	 * its own — one line of controls, not two.
	 */
	/*
	 * Double the writing's own inset, the same rhythm the menu's own sections
	 * space themselves by (see Menu.svelte's `.tear`/`h2`) — without it the
	 * first group's title sat flush under the buttons, reading as part of the
	 * same row rather than the start of the sheet.
	 */
	.corner {
		display: flex;
		align-items: center;
		margin-bottom: calc(var(--paper-inset) * 2);
	}

	/*
	 * `margin-left: auto` rather than `space-between` on the row: the sync
	 * button is not there at all when there is nothing to sync, and
	 * space-between with one child left pushes that child to the *left* — which
	 * put the burger under the thumb's left hand on an untouched sheet.
	 */
	.controls {
		display: flex;
		margin-left: auto;
	}
</style>
