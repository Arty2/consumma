<script lang="ts">
	import HandRect from './HandRect.svelte';
	import { ui } from '$lib/state/ui.svelte';
</script>

{#if ui.toast}
	<div class="toast" role="status" aria-live="polite">
		<HandRect seed="toast" wobble={2} />
		<span class="caps">{ui.toast.text}</span>
		{#if ui.toast.undo}
			<button type="button" class="caps" onclick={ui.toast.undo}>UNDO?</button>
		{/if}
	</div>
{/if}

<style>
	/*
	 * At the top, under the buttons in the corners.
	 *
	 * It used to sit at the bottom, which is where a phone puts its keyboard —
	 * so the one message that most wants reading, the one offering to undo what
	 * just happened, was behind the keys that had just caused it. Every toast
	 * here follows an edit, and an edit is made with the keyboard up.
	 *
	 * Below the corner row rather than level with it: those buttons are the
	 * other things drawn on this line, and a bar through them would cover the
	 * sync mark and the burger.
	 */
	.toast {
		position: fixed;
		left: 50%;
		top: calc(var(--corner-y) + var(--touch) + 0.5rem);
		translate: -50% 0;
		display: flex;
		align-items: center;
		/*
		 * The message keeps to the left, where the sheet's own writing starts,
		 * and UNDO goes to the far end. Huddled together they left most of a
		 * sheet-wide bar empty, which read as a box drawn round nothing.
		 */
		justify-content: space-between;
		gap: 1rem;
		/*
		 * A bar rather than a label, but inset from the paper on both sides so it
		 * reads as sitting in front of the sheet rather than as part of it.
		 */
		width: min(24rem, calc(100vw - 4rem));
		padding: 0.5rem 1rem;
	}

	/*
	 * The ground goes behind the ink, not behind the padding box.
	 *
	 * Every part of a drawn box is drawn outside its own edges: the corners
	 * jitter by up to `overshoot`, each segment bows by half the `wobble`, and
	 * the stroke straddles the path it follows — HandRect sets `overflow:
	 * visible` precisely so none of that is clipped. The box is then lifted by
	 * --cap-lift while the padding box is not. A ground that stops at the
	 * padding box therefore stops short of the ink on all four sides and a
	 * whole cap-lift short of it at the top, and the sheet shows through every
	 * gap the pen wandered into.
	 *
	 * So the paper takes the drawn box's geometry instead of the element's: the
	 * same lift, and a margin wider than the pen can reach.
	 *
	 * Absolutely positioned, so it is not a flex item; behind, because the
	 * translate above already makes this a stacking context and a positioned
	 * pseudo-element would otherwise paint over the words.
	 */
	.toast::before {
		content: '';
		position: absolute;
		inset: -0.3rem;
		translate: 0 calc(-1 * var(--cap-lift));
		background: var(--paper);
		z-index: -1;
	}

	/*
	 * The words sit on the middle of the box rather than the middle of their own
	 * line. Graphe's capitals ride high in their line box, so centring the box
	 * on the row left them above it — the same correction every drawn thing
	 * beside capitals makes, in the other direction.
	 */
	.toast :global(svg.rect) {
		translate: 0 calc(-1 * var(--cap-lift));
	}
</style>
