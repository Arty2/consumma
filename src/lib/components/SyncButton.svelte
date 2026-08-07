<script lang="ts">
	import { handArrow, handRefresh } from '$lib/draw/hand';
	import { seedFrom } from '$lib/draw/rng';
	import { sync } from '$lib/state/sync.svelte';
	import { ui } from '$lib/state/ui.svelte';

	/*
	 * Sits to the left of the burger, and only when there is something to do.
	 *
	 * An arrow up and out when edits are waiting: an outbox that is not empty,
	 * not a warning light. A circular arrow when nothing is waiting but the list
	 * has not been looked at in ten minutes, because nothing syncs on its own and
	 * a list left open all morning is as old as when it was opened.
	 *
	 * Neither is a nag. The button appearing is the whole of it — no banner, and
	 * nothing syncs until it is tapped.
	 */

	const SIZE = 22;

	// Drawn once each, so the strokes do not twitch as the count changes.
	const arrow = handArrow(SIZE, { seed: seedFrom('arrow'), wobble: 0.7 });
	const refresh = handRefresh(SIZE, { seed: seedFrom('refresh'), wobble: 0.7 });

	const waiting = $derived(sync.unsent > 0);
	const shown = $derived(waiting || sync.stale);

	const label = $derived(
		waiting
			? sync.unsent === 1
				? 'Sync — 1 change waiting to go'
				: `Sync — ${sync.unsent} changes waiting to go`
			: 'Sync — not synced for a while'
	);

	/*
	 * Says what happened, because nothing else here will.
	 *
	 * The menu shows `sync.message` in an alert, but this button is the way to
	 * sync without opening the menu — so a failure had no way of reaching anyone.
	 * Tapping it with the server unreachable did nothing at all, which is exactly
	 * how a broken deployment came to look like an idle one.
	 */
	async function syncNow() {
		const outcome = await sync.sync();

		// `null` means the cooldown or an in-flight sync swallowed it; the button
		// is disabled then, so there is nothing to explain.
		if (outcome && outcome.status !== 'synced' && sync.message) ui.say(sync.message);
	}

	/*
	 * Owns the clock. Thirty seconds is plenty against a ten-minute bar, and
	 * this is the one component always mounted. The interval callback runs
	 * outside the effect, so this writes `now` without ever reading it — an
	 * effect that does both never settles, and takes the tree down with it.
	 */
	$effect(() => {
		sync.now = Date.now();
		const tick = setInterval(() => (sync.now = Date.now()), 30_000);
		return () => clearInterval(tick);
	});
</script>

{#if shown}
	<button
		class="sync"
		type="button"
		disabled={sync.busy || sync.cooling}
		onclick={syncNow}
		aria-label={label}
		title={label}
	>
		<svg viewBox="0 0 {SIZE} {SIZE}" width={SIZE} height={SIZE} aria-hidden="true">
			<path d={waiting ? arrow : refresh} class="drawn" />
		</svg>
	</button>
{/if}

<style>
	.sync {
		width: var(--touch);
		height: var(--touch);
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	.sync:disabled {
		opacity: 0.4;
		cursor: default;
	}

	svg {
		overflow: visible;
	}
</style>
