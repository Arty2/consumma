<script lang="ts">
	import HandRect from './HandRect.svelte';
	import TextRule from './TextRule.svelte';
	import { langOf } from '$lib/doc/lang';
	import { handChevron } from '$lib/draw/hand';
	import { seedFrom } from '$lib/draw/rng';
	import { tapped } from '$lib/feel';
	import { sheet } from '$lib/state/doc.svelte';
	import { nameFor, type ListEntry } from '$lib/state/lists';
	import { lists } from '$lib/state/lists.svelte';
	import { sync } from '$lib/state/sync.svelte';

	/*
	 * Only ever on screen once there is a second list to choose between — a
	 * device with one list never renders this at all, so it stays exactly the
	 * page it always was. Reads like the group title it stands above: same
	 * face, same caps, a hand-drawn rule under it.
	 */

	let open = $state(false);
	let root: HTMLElement | undefined = $state();

	const CHEVRON = 12;
	const chevron = $derived(
		handChevron(CHEVRON, !open, { seed: seedFrom('listswitch'), wobble: 0.8 })
	);

	const activeName = $derived(nameFor(sheet.doc));
	/** Only once the active list has actually been somewhere — see §non-negotiables. */
	const activeCode = $derived(sync.code ? sync.code.slice(-4) : null);
	const label = $derived(activeCode ? `${activeName} — ${activeCode}` : activeName);

	const sorted = $derived([...lists.entries].sort((a, b) => b.lastUsedAt - a.lastUsedAt));

	function nameOf(entry: ListEntry): string {
		return entry.id === lists.current ? activeName : lists.nameOf(entry);
	}

	function codeOf(entry: ListEntry): string | null {
		const code = entry.id === lists.current ? sync.code : lists.codeOf(entry);
		return code ? code.slice(-4) : null;
	}

	function toggle() {
		open = !open;
	}

	function pick(id: string) {
		if (id !== lists.current) {
			lists.switchTo(id);
			tapped();
		}
		open = false;
	}

	function onnew() {
		lists.createList();
		tapped();
		open = false;
	}

	// Outside tap or Escape closes it — a small popover, not a full panel, so
	// it does not reach for the modal focus trap: there is nothing here to
	// hold Tab inside, and locking body scroll for one row of buttons would
	// be a much bigger door than this needs.
	$effect(() => {
		if (!open) return;

		function onpointerdown(event: PointerEvent) {
			if (root && !root.contains(event.target as Node)) open = false;
		}
		function onkeydown(event: KeyboardEvent) {
			if (event.key === 'Escape') open = false;
		}

		document.addEventListener('pointerdown', onpointerdown);
		document.addEventListener('keydown', onkeydown);

		return () => {
			document.removeEventListener('pointerdown', onpointerdown);
			document.removeEventListener('keydown', onkeydown);
		};
	});
</script>

{#if lists.visible}
	<div class="switcher" bind:this={root}>
		<button
			type="button"
			class="pill caps"
			lang={langOf(label)}
			aria-expanded={open}
			aria-haspopup="listbox"
			onclick={toggle}
		>
			{label}
			<svg
				class="chevron"
				viewBox="0 0 {CHEVRON} {CHEVRON}"
				width={CHEVRON}
				height={CHEVRON}
				aria-hidden="true"
			>
				<path d={chevron} class="drawn" />
			</svg>
		</button>
		<TextRule text={label} seed="listswitch" />

		{#if open}
			<div class="dropdown" role="listbox" aria-label="Lists">
				{#each sorted as entry (entry.id)}
					{@const rowName = nameOf(entry)}
					{@const rowCode = codeOf(entry)}
					<button
						type="button"
						class="row caps boxed"
						role="option"
						aria-selected={entry.id === lists.current}
						onclick={() => pick(entry.id)}
					>
						<HandRect seed={`listrow${entry.id}`} wobble={1.4} radius={3} />
						<span class="name" lang={langOf(rowName)}>{rowName}</span>
						{#if rowCode}<span class="code num">{rowCode}</span>{/if}
					</button>
				{/each}

				<button type="button" class="row new caps boxed" onclick={onnew}>
					<HandRect seed="listrownew" wobble={1.4} radius={3} />
					+ New list
				</button>
			</div>
		{/if}
	</div>
{/if}

<style>
	.switcher {
		position: relative;
		margin-bottom: 0.75rem;
	}

	.pill {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		min-height: var(--touch);
		font-family: var(--hand);
		font-size: var(--size-small);
	}

	.chevron {
		flex: none;
		translate: 0 calc(-1 * var(--cap-lift));
	}

	.dropdown {
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		z-index: 5;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding-top: 0.5rem;
		background: var(--paper);
	}

	.row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		width: 100%;
		text-align: left;
	}

	.row .code {
		margin-left: auto;
	}

	.row.new {
		justify-content: center;
		opacity: var(--faint);
	}
</style>
