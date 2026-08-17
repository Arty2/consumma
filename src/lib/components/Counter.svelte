<script lang="ts">
	import { length } from '$lib/doc/clean';
	import { COUNTER_WITHIN, LIMITS } from '$lib/doc/limits';
	import { nearLimit } from '$lib/doc/spill';

	type Props = {
		/** What is being typed. The count is of what is left after it. */
		draft: string;
		/** Whether there is a field open at all: a row at rest never counts. */
		open: boolean;
	};

	let { draft, open }: Props = $props();

	const remaining = $derived(LIMITS.taskText - length(draft));
	const shown = $derived(open && nearLimit(draft, LIMITS.taskText, COUNTER_WITHIN));
</script>

<!--
	How much room is left, and only once there is barely any.

	It counts down rather than up, because what is wanted at that point is how
	much further the row will go, not how far it has come. It cannot go below
	nought: at the limit the row fills up and the rest starts the next one (see
	doc/spill.ts), so nought is the last thing it ever says.

	One component for the task row and the add row, which had a copy each — the
	same markup, the same rule and the same block of CSS, written twice and
	therefore due to disagree.
-->
{#if shown}
	<span class="counter num" aria-live="polite">{remaining}</span>
{/if}

<style>
	/*
	 * Under the checkbox, and stuck to the foot of the row.
	 *
	 * It used to stand in the left gutter level with the first line, out where
	 * the paper's own margin is. That put it beside the start of the writing —
	 * which is the one part of a long task nobody is looking at when they are
	 * running out of room. The writing is being done at the bottom of the row,
	 * so the count belongs at the bottom of the row: `bottom: 0` on a box the
	 * width of the checkbox column puts it directly under the mark and directly
	 * beside the line being typed, however many lines there are above it.
	 *
	 * Out of the flow, as it has always been. In the row it was a cell that took
	 * its width from the line, so the words lost room at exactly the moment
	 * there was least of it — and the count of what was left was itself the
	 * reason there was less.
	 */
	.counter {
		position: absolute;
		left: 0;
		bottom: 0;
		/*
		 * `.num` lifts every figure in the app off its baseline with a relative
		 * `top`, so that a mono digit reads level with Graphe's capitals beside
		 * it. Positioned, that `top` stops being a nudge and becomes an edge —
		 * and an absolute box given both a top and a bottom stretches between
		 * them, which made this the height of the whole row. There are no
		 * capitals to be level with here in any case.
		 */
		top: auto;
		width: var(--touch);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		opacity: 0.55;
		font-size: var(--size-small);
		/* Never in the way of the box above it, or of the finger going for it. */
		pointer-events: none;
		user-select: none;
		-webkit-user-select: none;
	}
</style>
