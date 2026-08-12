import { describe, expect, it } from 'vitest';
import { angleAt, axisAt, commits, DRIFT, progress, QUARTER, SLACK } from '../src/lib/turn';

/*
 * The arithmetic behind turning the paper by hand. Both sides of the receipt
 * read it, so it is worth pinning on its own rather than only through a
 * browser.
 */

const WIDE = 390;

describe('progress', () => {
	it('is nothing until the drag is past the slack', () => {
		expect(progress(0, WIDE)).toBe(0);
		expect(progress(SLACK, WIDE)).toBe(0);
		// A tap is never perfectly still; the paper must not twitch under one.
		expect(progress(SLACK - 1, WIDE)).toBe(0);
	});

	it('counts from the end of the slack, not from the touch', () => {
		expect(progress(SLACK + 39, WIDE)).toBeCloseTo(39 / WIDE, 6);
	});

	it('stops at the whole width, however far the hand goes', () => {
		expect(progress(WIDE * 4, WIDE)).toBe(1);
	});

	it('is nothing on paper with no width, rather than infinite', () => {
		// A panel measured before it is laid out, which is a division by zero.
		expect(progress(50, 0)).toBe(0);
		expect(progress(50, -10)).toBe(0);
		expect(progress(50, Number.NaN)).toBe(0);
	});

	it('never goes backwards, however far the hand goes the wrong way', () => {
		expect(progress(-500, WIDE)).toBe(0);
	});
});

describe('angleAt', () => {
	it('turns the paper a quarter and no further', () => {
		expect(angleAt(WIDE * 2, WIDE, 1)).toBe(QUARTER);
		expect(angleAt(WIDE * 2, WIDE, -1)).toBe(-QUARTER);
	});

	it('gives the two sides opposite ways round, which is one rotation', () => {
		const travelled = 120;
		expect(angleAt(travelled, WIDE, 1)).toBe(-angleAt(travelled, WIDE, -1));
	});

	it('leaves the paper flat until the drag is past the slack', () => {
		expect(angleAt(SLACK, WIDE, 1)).toBe(0);
	});
});

describe('axisAt', () => {
	it('sits in the middle while nothing is being dragged', () => {
		expect(axisAt(0, WIDE)).toBe(50);
	});

	it('wanders with the drag, and no further than the drift', () => {
		expect(axisAt(WIDE * 2, WIDE)).toBe(50 + DRIFT);
		expect(axisAt(SLACK + WIDE / 2, WIDE)).toBeCloseTo(50 + DRIFT / 2, 6);
	});

	it('only ever moves the way the finger went', () => {
		expect(axisAt(-200, WIDE)).toBe(50);
	});
});

describe('commits', () => {
	it('finishes the turn once a quarter of the paper has gone by', () => {
		expect(commits(WIDE * 0.26, 800, WIDE)).toBe(true);
		expect(commits(WIDE * 0.24, 800, WIDE)).toBe(false);
	});

	it('takes a flick as an answer, short but fast', () => {
		expect(commits(41, 200, WIDE)).toBe(true);
		// Far enough but too slow to be a flick, and short of the quarter.
		expect(commits(41, 400, WIDE)).toBe(false);
		// Fast enough but too short to be a flick.
		expect(commits(39, 100, WIDE)).toBe(false);
	});

	it('measures the flick in the hand, not in the paper', () => {
		// The same flick answers the same on a phone and on a desktop, where
		// the paper is wider — a hand does not know how wide the paper is.
		expect(commits(60, 150, 320)).toBe(true);
		expect(commits(60, 150, 544)).toBe(true);
	});

	it('never commits on a drag that went the other way', () => {
		expect(commits(-300, 100, WIDE)).toBe(false);
	});
});
