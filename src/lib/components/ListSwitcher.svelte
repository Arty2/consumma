<script lang="ts">
	import HandRect from './HandRect.svelte';
	import TextRule from './TextRule.svelte';
	import { langOf } from '$lib/doc/lang';
	import { handChevron, handLine } from '$lib/draw/hand';
	import { seedFrom } from '$lib/draw/rng';
	import { tapped } from '$lib/feel';
	import { sheet } from '$lib/state/doc.svelte';
	import { nameFor, type ListEntry } from '$lib/state/lists';
	import { lists } from '$lib/state/lists.svelte';
	import { sync } from '$lib/state/sync.svelte';

	/*
	 * Two homes for the same control: above the sheet, where it only ever
	 * appears once there is a second list to choose between, and inside the
	 * Menu, where it stands in for the button that used to make that second
	 * list — so it has to be there even at one, or there would be nowhere
	 * left to reach a second from. `context` tells the two apart: whether it
	 * is shown at all, whether it claims the room above the corner buttons,
	 * and what its seeds are namespaced by, so two boxes drawn at once —
	 * possible in the DOM even though the sheet is never visible behind an
	 * open Menu — are never the same box.
	 */
	type Props = {
		context?: 'sheet' | 'menu';
		onafterselect?: () => void;
	};

	let { context = 'sheet', onafterselect }: Props = $props();

	let open = $state(false);
	let root: HTMLElement | undefined = $state();
	let dropdownWidth = $state(0);

	const shown = $derived(context === 'menu' ? true : lists.visible);

	const CHEVRON = 12;
	const chevron = $derived(
		handChevron(CHEVRON, !open, { seed: seedFrom(`listswitch-${context}`), wobble: 0.8 })
	);

	const activeName = $derived(nameFor(sheet.doc));
	/** Only once the active list has actually been somewhere — see §non-negotiables. */
	const activeCode = $derived(sync.code ? sync.code.slice(-4) : null);
	const label = $derived(activeCode ? `${activeName} — ${activeCode}` : activeName);

	const sorted = $derived([...lists.entries].sort((a, b) => b.lastUsedAt - a.lastUsedAt));

	/** One line, drawn once and reused between every row — separators, not boxes. */
	const dividerPath = $derived(
		dropdownWidth > 0
			? handLine(dropdownWidth, { seed: seedFrom(`listsep-${context}`), wobble: 0.8, y: 2 })
			: ''
	);

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
		onafterselect?.();
	}

	function onnew() {
		lists.createList();
		tapped();
		open = false;
		onafterselect?.();
	}

	// A real button gets Enter for free; a plain row has to ask.
	function onrowkeydown(event: KeyboardEvent, id: string) {
		if (event.key !== 'Enter') return;
		event.preventDefault();
		pick(id);
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

	/*
	 * The toast and the Menu's own ✕ both stand relative to where the corner
	 * buttons actually render, via --corner-y — and this pill, shown above
	 * them, is the one thing that moves them down. Only the sheet's own copy
	 * sits where the corner row does; the Menu's copy has nothing to do with
	 * the burger's position and must never write this.
	 *
	 * `switcherHeight` comes from `bind:clientHeight` below rather than a
	 * ResizeObserver of our own — the same reflow-tracking Svelte already
	 * ships for every `bind:clientWidth` elsewhere (TextRule, Perforation,
	 * this file's own `.measure`), so this reuses that instead of paying for
	 * a second copy.
	 */
	let switcherHeight = $state(0);

	$effect(() => {
		const on = context === 'sheet' && shown && root;
		const mb = on ? parseFloat(getComputedStyle(root!).marginBottom) || 0 : 0;
		document.documentElement.style.setProperty('--switcher-h', `${on ? switcherHeight + mb : 0}px`);
	});
</script>

{#snippet divider()}
	<svg
		class="divider"
		viewBox="0 0 {dropdownWidth} 3"
		width={dropdownWidth}
		height="3"
		aria-hidden="true"
	>
		{#if dividerPath}<path d={dividerPath} class="drawn" />{/if}
	</svg>
{/snippet}

{#if shown}
	<div class="switcher {context}" bind:this={root} bind:clientHeight={switcherHeight}>
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
		<TextRule text={label} seed={`listswitch-${context}`} />

		{#if open}
			<div class="dropdown" role="listbox" aria-label="Lists" bind:clientWidth={dropdownWidth}>
				{#each sorted as entry, i (entry.id)}
					{#if i > 0}{@render divider()}{/if}
					{@const rowName = nameOf(entry)}
					{@const rowCode = codeOf(entry)}
					<div
						class="row caps"
						role="option"
						tabindex="0"
						aria-selected={entry.id === lists.current}
						onclick={() => pick(entry.id)}
						onkeydown={(event) => onrowkeydown(event, entry.id)}
					>
						<span class="name" lang={langOf(rowName)}>{rowName}</span>
						{#if rowCode}<span class="code">{rowCode}</span>{/if}
					</div>
				{/each}

				{#if sorted.length > 0}{@render divider()}{/if}

				<button type="button" class="row new caps boxed" onclick={onnew}>
					<HandRect seed={`listrownew-${context}`} wobble={1.4} radius={3} />
					New list
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

	/*
	 * Above the sheet, this sits outside <main> now, so it only inherits the
	 * page's own --paper-x, not the sheet's extra --paper-inset. Without this
	 * it reads noticeably less inset than the sheet's own left margin.
	 *
	 * Centred explicitly: the pill is an inline-flex box and left-aligns by
	 * default. Menu.svelte's own `.body` already centres everything in it,
	 * so its copy needs nothing extra here.
	 */
	.switcher.sheet {
		padding-inline: var(--paper-inset);
		text-align: center;
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

	/*
	 * Menu.svelte's own panel scrolls (`.scroll { overflow-y: auto; }`), and
	 * an absolutely positioned dropdown taller than what's left of that
	 * scroll box is clipped — its lower rows would sit there unreachable
	 * rather than merely out of sight, unlike on the sheet where <main> has
	 * no overflow and the dropdown genuinely floats free. In flow instead,
	 * it just pushes the rest of the panel down.
	 */
	.switcher.menu .dropdown {
		position: static;
		z-index: auto;
	}

	/*
	 * Shorter than --touch: a row here is read and tapped once, not held, and
	 * a column of full touch-height rows read as a second menu rather than a
	 * short list. `.row.new` matches it below, overriding the `.boxed` floor
	 * it would otherwise inherit, so the drawn button reads as one more row
	 * rather than a taller thing bolted on the end.
	 */
	.row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		width: 100%;
		min-height: 2.25rem;
		text-align: left;
		cursor: pointer;
	}

	.row .code {
		margin-left: auto;
	}

	.row.new {
		justify-content: center;
		opacity: var(--faint);
		min-height: 2.25rem;
	}

	.divider {
		display: block;
		width: 100%;
		height: 3px;
		overflow: visible;
	}
</style>
