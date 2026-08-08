<script lang="ts">
	import { browser } from '$app/environment';
	import { handArrow, handRefresh, handSlashedCircle } from '$lib/draw/hand';
	import { seedFrom } from '$lib/draw/rng';
	import { sheet } from '$lib/state/doc.svelte';
	import { sync } from '$lib/state/sync.svelte';
	import { ui } from '$lib/state/ui.svelte';

	/*
	 * Sits to the left of the burger, and only when there is something to do.
	 *
	 * An arrow up and out when edits are waiting: an outbox that is not empty,
	 * not a warning light. A circular arrow when nothing is waiting but the list
	 * has not been looked at in ten minutes, because nothing syncs on its own and
	 * a list left open all morning is as old as when it was opened. A crossed
	 * circle when the list could not be reached, which outranks both — there is
	 * no point offering to send when nothing can leave.
	 *
	 * None of them is a nag. The button appearing is the whole of it — no banner,
	 * and nothing syncs until it is tapped.
	 */

	const SIZE = 22;

	// Drawn once each, so the strokes do not twitch as the count changes.
	const arrow = handArrow(SIZE, { seed: seedFrom('arrow'), wobble: 0.7 });
	const refresh = handRefresh(SIZE, { seed: seedFrom('refresh'), wobble: 0.7 });
	const slash = handSlashedCircle(SIZE, { seed: seedFrom('offline'), wobble: 0.7 });

	const waiting = $derived(sync.unsent > 0);
	const offline = $derived(sync.status === 'offline');

	/*
	 * Nothing written and no code: there is nothing to send and nothing to fetch,
	 * so there is nothing to offer. Staleness alone would otherwise put the
	 * button on the page for someone who has just arrived, because a device that
	 * has never synced has been not-syncing since the epoch.
	 */
	const nothingYet = $derived(!sheet.written && !sync.code);

	/*
	 * Being unreachable is worth showing on its own. Everything is safe on the
	 * device either way, but "it did not go" is not something to find out later.
	 */
	const shown = $derived(!nothingYet && (offline || waiting || sync.stale));

	/*
	 * Asked in JS rather than left to a media query, as every animation here is:
	 * `leaving` is cleared by its own animationend, and a fade that is merely
	 * switched off in CSS never ends, so the button would sit invisible in the
	 * corner holding its place for good.
	 */
	const still = () => browser && matchMedia('(prefers-reduced-motion: reduce)').matches;

	/** While a sync is actually in flight — from here or from the menu. */
	const working = $derived(sync.busy && !still());

	/*
	 * On its way out after a sync that left nothing to offer.
	 *
	 * Kept on the page for the length of the fade, because the button vanishing
	 * is the only sign the corner gives that the sync landed, and a mark that
	 * blinks out is one you are never sure you saw.
	 */
	let leaving = $state(false);
	let was = false;

	$effect(() => {
		const now = shown;
		if (now) leaving = false;
		else if (was && !still()) leaving = true;
		was = now;
	});

	const label = $derived(
		offline
			? 'Sync — no connection last time'
			: waiting
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
		if (!outcome) return;

		// Both halves, or the quiet one is indistinguishable from a dead button.
		if (outcome.status === 'synced') ui.say('Synced.');
		else if (sync.message) ui.say(sync.message);
	}

	/*
	 * Advances the clock the staleness derives from, and recomputes the mark so
	 * the crossed circle is not left behind by a connection that came or went.
	 * Nothing here syncs — this is not a poll and not a reconnect trigger.
	 *
	 * The interval callback runs outside the effect, so this writes `now` without
	 * ever reading it — an effect that does both never settles, and takes the
	 * tree down with it.
	 */
	$effect(() => {
		sync.now = Date.now();
		const tick = setInterval(() => {
			sync.now = Date.now();
			sync.refresh();
		}, 15_000);
		return () => clearInterval(tick);
	});
</script>

{#if shown || leaving}
	<button
		class="sync"
		class:leaving
		type="button"
		disabled={leaving || sync.busy || sync.cooling}
		onclick={syncNow}
		onanimationend={() => (leaving = false)}
		aria-label={label}
		title={label}
	>
		<svg
			class="mark"
			class:working
			class:turning={working && !offline && !waiting}
			viewBox="0 0 {SIZE} {SIZE}"
			width={SIZE}
			height={SIZE}
			aria-hidden="true"
		>
			<path d={offline ? slash : waiting ? arrow : refresh} class="drawn" />
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

	/*
	 * One beat for every mark this button draws, so the corner reads as one
	 * thing working rather than as two different ideas about waiting. The
	 * circular arrow turns, because it is a stroke that came round and turning
	 * is what it already means. The outbox arrow cannot turn without pointing
	 * somewhere it does not mean, and the crossed circle turning would read as
	 * a mark being scribbled out, so both of those breathe on the same count
	 * instead — opacity and scale, as everywhere else here.
	 */
	.working {
		animation-duration: 900ms;
		animation-iteration-count: infinite;
		animation-name: pulse;
		animation-timing-function: ease-in-out;
	}

	.working.turning {
		animation-name: turn;
		animation-timing-function: linear;
	}

	@keyframes turn {
		to {
			rotate: 360deg;
		}
	}

	@keyframes pulse {
		50% {
			opacity: 0.4;
			scale: 0.86;
		}
	}

	/*
	 * Gone, and the last thing it does is say so. Cleared by its own
	 * animationend — see `still()` for why that is asked in JS.
	 */
	.leaving {
		animation: fade 260ms ease-out forwards;
		pointer-events: none;
	}

	@keyframes fade {
		to {
			opacity: 0;
			scale: 0.8;
		}
	}
</style>
