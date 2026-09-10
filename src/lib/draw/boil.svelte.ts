import { browser } from '$app/environment';
import type { HandOptions } from './hand.ts';
import { seedFrom } from './rng.ts';

/**
 * A mark that is working boils.
 *
 * The same hand, drawing the same mark four times over: no two strokes come
 * out identical, and cycling between them is what makes a line look alive on
 * paper — the boil that hand-drawn animation has always had, rather than a
 * shape being scaled or faded by a machine.
 *
 * It began on the sync button, which is where the comments below come from,
 * and the corner fold's bin now works the same way. Two marks drawing the
 * technique twice is two techniques as soon as one of them is retuned, so it
 * is written once here: the drawings, the beat, and the ticker that says which
 * one is on screen.
 */

/**
 * How many times each mark is drawn, and how long each drawing is held.
 *
 * Four is what the technique uses: enough that the loop does not read as a
 * flicker between two states, few enough that each drawing is on screen long
 * enough to be seen as a drawing. `900 / 4` keeps the one duration the whole
 * corner already works to.
 */
export const FRAMES = 4;
export const BEAT_MS = 900 / FRAMES;

/**
 * How loose the hand is on each of the four drawings.
 *
 * A different seed alone only moves the same amount of wobble to different
 * places, so four frames drawn to one setting differ about as much as four
 * copies of a printed line — the boil was there but barely readable. A hand
 * does not redraw at a constant roughness either, so the looseness varies
 * frame to frame as well as the seed.
 *
 * The first is the resting mark and keeps 0.7, which is what the burger and
 * the theme glyph are drawn at — a mark standing still in that row has to
 * belong to it. The other three are only ever seen in motion, where a rougher
 * line reads as a hand working rather than as a shaky one.
 */
export const WOBBLES = [0.7, 1.8, 1.2, 2.1];

/**
 * The four drawings, made up front.
 *
 * Drawn once each rather than on demand, so the strokes never twitch as the
 * state changes — the ticker below picks between drawings that already exist.
 * The first frame keeps the bare seed, so a mark standing still is the same
 * mark it has always been.
 *
 * The caller closes over its own size, because a glyph drawn in a square and
 * one drawn in a box do not take the same arguments and the technique does not
 * care which it is.
 */
export function boil(name: string, draw: (options: HandOptions) => string): string[] {
	return Array.from({ length: FRAMES }, (_, i) =>
		draw({ seed: seedFrom(i === 0 ? name : `${name}${i}`), wobble: WOBBLES[i] })
	);
}

/**
 * Which of the four is on screen, for as long as the mark is working.
 *
 * Zero whenever it is not, so a mark standing still is always the same mark:
 * the boil is something a mark does while it works, not a state it is left in.
 * `prefers-reduced-motion` is asked here rather than left to CSS — no keyframe
 * can swap one path for another, so this is a JS animation and it has to
 * refuse to start rather than be switched off.
 */
export function boiling(working: () => boolean) {
	let frame = $state(0);

	const still = () => browser && matchMedia('(prefers-reduced-motion: reduce)').matches;

	$effect(() => {
		if (!working() || still()) {
			frame = 0;
			return;
		}

		/*
		 * Counted locally rather than off `frame` itself, so the callback only
		 * ever writes reactive state and never reads it — the mistake that took
		 * this tree's reactivity down once already (see sync.svelte.ts's
		 * `refresh`) was an effect that did both.
		 */
		let next = 0;
		const tick = setInterval(() => (frame = next = (next + 1) % FRAMES), BEAT_MS);
		return () => clearInterval(tick);
	});

	return {
		get frame() {
			return frame;
		}
	};
}
