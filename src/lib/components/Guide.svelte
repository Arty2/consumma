<script lang="ts">
	import { handOval, handSwoop } from '$lib/draw/hand';
	import { seedFrom } from '$lib/draw/rng';
	import { t } from '$lib/i18n';
	import { guide } from '$lib/state/guide.svelte';

	/*
	 * The guidance drawn over the page for somebody who arrived on an
	 * invitation: an arrow to the thing to tap, and the name of the thing
	 * beside it.
	 *
	 * It is drawn *over* the app and not in it. Nothing on the sheet is
	 * labelled and nothing here changes that — no control grows a caption, no
	 * empty state learns to talk. This is a hand reaching over somebody's
	 * shoulder and pointing, in red, for as long as it takes them to find the
	 * field, and it takes the app's own marks with it when it goes.
	 *
	 * Red, and this is the second thing in the app allowed to be (the first is
	 * the debug outline). The reason is the same one: a mark drawn in the ink
	 * would be part of the drawing. This is not part of the drawing — it is
	 * written on top of it, the way somebody hands you a printed page with a
	 * biro mark on it, and the whole of what makes that legible is that the
	 * biro is not the printing.
	 *
	 * The layer never takes a pointer event. It points at controls, so anything
	 * it swallowed would be the control it is pointing at.
	 */

	/** The viewport, which is what the marks are laid out in. */
	let width = $state(0);
	let height = $state(0);
	/** Where the thing being pointed at is, in viewport pixels. */
	let box = $state<{ x: number; y: number; width: number; height: number } | null>(null);
	/** The word, measured so the arrow can start clear of it. */
	let word = $state<HTMLElement | null>(null);
	let wordBox = $state<{ x: number; y: number; width: number; height: number } | null>(null);

	/** Held clear of the thing it goes round, so the loop is a loop and not a box. */
	const LOOP_X = 14;
	const LOOP_Y = 17;
	/** The arrow stops this far short of what it points at. */
	const REACH = 16;
	/** And starts this far out from the word. */
	const OFF = 24;

	/**
	 * One word on each face, and each names what the mark beside it is for.
	 *
	 * On the sheet it is the far end of the arrow, and it says what is behind
	 * the glyph the arrow lands on. In the panel it stands under the ring and
	 * says what to do with what is inside it — which is the thing an arrow
	 * cannot say, and the reason the panel has a word rather than a second
	 * arrow. `paste` is the word because the empty field pastes on a tap: it
	 * names what a finger there will get, not what the field is called.
	 */
	const label = $derived(guide.step === 'code' ? t.guide.paste : t.guide.join);

	/**
	 * Measures the target and the word together, because the arrow is drawn
	 * between them and one without the other is half an answer.
	 *
	 * `data-guide` names the target rather than a class or a selector down into
	 * a component: what is being pointed at is a fact about the interaction,
	 * and the markup that draws it is free to change.
	 */
	function measure() {
		width = window.innerWidth;
		height = window.innerHeight;

		const target = guide.step && document.querySelector(`[data-guide="${guide.step}"]`);
		if (!target) {
			box = null;
			return;
		}

		const rect = target.getBoundingClientRect();
		box = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };

		const said = word?.getBoundingClientRect();
		wordBox = said ? { x: said.x, y: said.y, width: said.width, height: said.height } : null;
	}

	/**
	 * Everything on the page has stopped moving.
	 *
	 * The step changes as the paper begins to turn over, and every box the
	 * guidance measures is on that paper: read mid-rotation, the field's box is
	 * a line somewhere in the middle of the room and an arrow drawn to it
	 * points at nothing. So the marks wait for the turn rather than for a
	 * duration — a number copied from `--flip` here would be a second place
	 * that has to be right.
	 *
	 * Animations that never end are left out of the wait: the sync mark turns
	 * for as long as a sync is in flight, and waiting on that is waiting for
	 * ever. A cancelled one rejects, and either way it has stopped.
	 */
	function settled(): Promise<unknown> {
		return Promise.all(
			document
				.getAnimations()
				.filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
				.map((a) => a.finished.catch(() => undefined))
		);
	}

	/*
	 * Measured after anything that could have moved it, and never on a clock of
	 * its own: a ticker reading two boxes forever is a cost paid by every phone
	 * for something that is on screen for a few seconds.
	 *
	 * Nothing is drawn in between. A mark left at the old step's geometry while
	 * the paper turns is an arrow pointing at where the burger used to be.
	 */
	$effect(() => {
		// Read so this re-runs when the step changes.
		void guide.step;

		if (!guide.showing) {
			box = null;
			return;
		}

		box = null;
		let live = true;
		settled().then(() => {
			/*
			 * A frame after the turn, not on it: the panel is mounted by the time
			 * its half of the turn ends, but the scroller has not yet been taken
			 * to the field, and measuring on that frame points the arrow at where
			 * the field was on the way past.
			 */
			if (live) requestAnimationFrame(() => live && measure());
		});

		const again = () => measure();
		addEventListener('resize', again);
		// Capture: a scroll event does not bubble, and the panel has its own.
		addEventListener('scroll', again, { capture: true, passive: true });

		return () => {
			live = false;
			removeEventListener('resize', again);
			removeEventListener('scroll', again, { capture: true });
		};
	});

	/*
	 * Put away by doing anything else.
	 *
	 * Somebody pointing over your shoulder stops pointing the moment you start
	 * doing something of your own, and that is the whole rule: a press that
	 * lands anywhere but on the thing being pointed at ends the guidance. It is
	 * the only way out that a phone has — there is no Escape key on one, and
	 * two red marks that could only be dismissed by producing a code would
	 * outstay any welcome.
	 *
	 * Listened for rather than taken: the handler is passive and on the
	 * capture phase, so it sees the press and changes nothing about where it
	 * goes. The layer itself never takes a pointer event at all.
	 */
	$effect(() => {
		if (!guide.showing) return;

		const elsewhere = (event: PointerEvent) => {
			if (!(event.target as Element | null)?.closest('[data-guide]')) guide.saw('dropped');
		};
		/*
		 * Escape is the keyboard's way out, and it puts away whatever is on top.
		 * While the panel is open that is the panel — closing it takes the
		 * guidance back to the burger rather than ending it, which is the same
		 * answer turning the paper over by hand gives. The guidance is only the
		 * top thing when nothing else is.
		 */
		const escape = (event: KeyboardEvent) => {
			if (event.key !== 'Escape') return;
			if (document.querySelector('[role="dialog"]')) return;

			guide.saw('dropped');
		};

		addEventListener('pointerdown', elsewhere, { capture: true, passive: true });
		addEventListener('keydown', escape, { capture: true, passive: true });

		return () => {
			removeEventListener('pointerdown', elsewhere, { capture: true });
			removeEventListener('keydown', escape, { capture: true });
		};
	});

	/**
	 * Where the word goes, and the two steps answer differently because the two
	 * marks do.
	 *
	 * On the sheet the word is the far end of an arrow, so it stands away from
	 * what is being pointed at and towards the middle of the screen, which is
	 * where a hand writing on a page has room. Its quadrant is read off the
	 * target rather than fixed, so a sheet scrolled somewhere unexpected does
	 * not put the word on top of the mark.
	 *
	 * In the panel there is no arrow to be the far end of. The word is written
	 * against the ring instead — under it and off to one side, the way a hand
	 * rings a thing and then writes beside the ring rather than starting a
	 * second mark somewhere else on the page. Off to the side and not centred,
	 * because centred under the ring is directly over the JOIN button, and a
	 * word laid across a button reads as a label on it.
	 */
	const placed = $derived.by(() => {
		if (!box || width === 0) return null;

		const cx = box.x + box.width / 2;
		const cy = box.y + box.height / 2;

		if (guide.step !== 'code') {
			return {
				x: cx < width / 2 ? width * 0.62 : width * 0.38,
				y: cy < height / 2 ? height * 0.66 : height * 0.32
			};
		}

		/*
		 * Clear of the ring's own bottom, not the field's, and kept on the
		 * screen: the ring is nearly as wide as the paper, so a fixed step to
		 * the side would carry the word off the edge of a narrow one.
		 *
		 * To the left, which is the side a phrase has room on. It is two words
		 * now rather than one, and set at display size two words reach most of
		 * the way across a phone — off to the right there was nothing to move
		 * into, and the clamp below would have pinned it to the edge, which is
		 * a word stopped by the screen rather than placed. Left it starts where
		 * the writing on either face starts, and runs the way reading does.
		 */
		const said = wordBox ?? { width: 190, height: 32 };
		const margin = 12;
		const aside = cx - box.width * 0.3;

		return {
			x: Math.min(Math.max(aside, margin + said.width / 2), width - margin - said.width / 2),
			y: cy + box.height / 2 + LOOP_Y + said.height / 2 + 10
		};
	});

	/**
	 * Round what is being pointed at, and only on the field: see below.
	 *
	 * Thrown rather than drawn. `jitter` is what makes that the difference:
	 * a wobbled ellipse is a true ellipse drawn unsteadily — every radius still
	 * correct — and at this size that reads as traced. A ring somebody threw
	 * round something is fatter on one side and runs out of room at the end,
	 * and it carries well past where it started rather than closing on it.
	 */
	const loop = $derived.by(() => {
		if (!box || guide.step !== 'code') return null;

		return handOval(box.width + LOOP_X * 2, box.height + LOOP_Y * 2, {
			seed: seedFrom('guide-loop'),
			wobble: 1.8,
			tilt: -3.5,
			/*
			 * Sampled far more finely than a loop round a word, because this one
			 * is drawn at the width of the paper — see `steps` in handOval. The
			 * overshoot is counted in those steps, so it grows with them: this
			 * is about a sixth of the way round again, which is a pen carrying
			 * past its own start rather than stopping on it.
			 */
			steps: 26,
			over: 2.4,
			jitter: 0.055
		});
	});

	/*
	 * The arrow, from the word to the target — and only on the sheet.
	 *
	 * The panel has none. An arrow there had to end on the field, which is a
	 * few millimetres of a screen that is already a column of controls, so its
	 * head came out smaller than the thing it was pointing at and read as a
	 * tick rather than as a direction. What answers that is not a bigger arrow:
	 * the ring already says which thing, exactly, and a word beside the ring
	 * says what to do with it. Two marks, no third.
	 *
	 * It stops short at both ends — clear of the word, so the two are not one
	 * mark, and clear of what it points at, so the thing can still be seen.
	 */
	const swoop = $derived.by(() => {
		if (!box || !placed || guide.step !== 'burger') return null;

		const cx = box.x + box.width / 2;
		const cy = box.y + box.height / 2;

		const dx = cx - placed.x;
		const dy = cy - placed.y;
		const span = Math.hypot(dx, dy) || 1;
		const ux = dx / span;
		const uy = dy / span;

		/* Out of the word's own box before the stroke starts. */
		const clear = wordBox ? Math.hypot(wordBox.width, wordBox.height) / 2 + OFF : OFF;

		/*
		 * And short of the target: half its own box along the line, plus the
		 * loop where there is one. Measured along the line rather than to the
		 * nearest edge, which on a box as wide as the code field would land the
		 * head in the middle of the writing.
		 */
		const held =
			Math.hypot((box.width / 2) * ux, (box.height / 2) * uy) +
			REACH +
			(loop ? Math.hypot(LOOP_X * ux, LOOP_Y * uy) : 0);

		return handSwoop(
			{ x: placed.x + ux * clear, y: placed.y + uy * clear },
			{ x: cx - ux * held, y: cy - uy * held },
			{ seed: seedFrom('guide-swoop'), wobble: 1.2, bow: 0.16 }
		);
	});
</script>

<!--
	Out of the accessibility tree entirely: it is a drawing of two marks and a
	word, over controls that already say what they are. What it says to
	somebody who cannot see it is said once, in words, by the page that started
	it — `t.guide.said`.
-->
{#if guide.showing && box}
	<div class="guide" aria-hidden="true" data-guide-ink>
		<svg viewBox="0 0 {width} {height}" {width} {height}>
			{#if loop}
				<!--
					Only round the field. The burger is a 22px glyph in the corner of
					the paper and a loop round it would be bigger than the mark it
					held; an arrow arriving at it is already unambiguous, because
					there is nothing else up there. Round the field the loop is doing
					something an arrow cannot: saying how much of the panel is the
					thing meant, when the panel is a column of controls.
				-->
				<path d={loop} class="ink" transform="translate({box.x - LOOP_X} {box.y - LOOP_Y})" />
			{/if}
			{#if swoop}
				<path d={swoop} class="ink" />
			{/if}
		</svg>

		<!--
			Written, not drawn. Every other mark in this app is a path because
			every other mark is a mark; this is a word, and a word set in the
			app's own hand at the app's own display size is the app saying it —
			the same face the sheet is written in, one size up, in the biro.
		-->
		{#if placed && label}
			<span class="word caps" bind:this={word} style:left="{placed.x}px" style:top="{placed.y}px"
				>{label}</span
			>
		{/if}
	</div>
{/if}

<style>
	/*
	 * Over everything, including the panel (z-index 10), and under nothing —
	 * there is nothing above the panel but this.
	 */
	.guide {
		position: fixed;
		inset: 0;
		z-index: 11;
		/*
		 * It points at controls. Anything it swallowed would be the control it
		 * is pointing at, which is the one thing it must never do.
		 */
		pointer-events: none;
	}

	svg {
		position: absolute;
		inset: 0;
		overflow: visible;
	}

	/*
	 * The biro. Drawn heavier than the app's own strokes and never dashed: it
	 * is one hand writing quickly over the top of something, not part of the
	 * drawing underneath.
	 */
	.ink {
		fill: none;
		stroke: var(--guide);
		stroke-width: 3;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.word {
		position: absolute;
		translate: -50% -50%;
		font-family: var(--hand);
		font-size: var(--size-display);
		line-height: 1;
		color: var(--guide);
		white-space: nowrap;
		pointer-events: none;
	}
</style>
