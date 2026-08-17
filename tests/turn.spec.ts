import { describe, expect, it } from 'vitest';
import {
	angleAt,
	axisAt,
	commits,
	DRIFT,
	LEAD,
	leadFor,
	OVER,
	progress,
	pushOf,
	QUARTER,
	slideAt,
	SLACK
} from '../src/lib/turn';

/*
 * The arithmetic behind turning the paper by hand. Both sides of the receipt
 * read it, so it is worth pinning on its own rather than only through a
 * browser.
 */

const WIDE = 390;

describe('leadFor', () => {
	it('is the room the paper has, when that is less than it wants', () => {
		// A phone: the paper is drawn almost to the edges, so it is a nudge.
		expect(leadFor(8)).toBe(8);
	});

	it('is the lead-in, when there is more room than that', () => {
		expect(leadFor(400)).toBe(LEAD);
	});

	it('is nothing at all when the paper is already against the screen', () => {
		expect(leadFor(0)).toBe(0);
		expect(leadFor(-20)).toBe(0);
		expect(leadFor(Number.NaN)).toBe(0);
	});
});

describe('slideAt', () => {
	it('does not move under a tap that was not quite still', () => {
		expect(slideAt(0, LEAD)).toBe(0);
		expect(slideAt(SLACK, LEAD)).toBe(0);
	});

	it('follows the finger for the length of the lead-in', () => {
		expect(slideAt(SLACK + 5, LEAD)).toBe(5);
		expect(slideAt(SLACK + LEAD, LEAD)).toBe(LEAD);
	});

	it('stops there, and the turn takes over', () => {
		expect(slideAt(SLACK + LEAD + 400, LEAD)).toBe(LEAD);
	});

	it('stops at the room it was given, so the paper never leaves the screen', () => {
		expect(slideAt(SLACK + 400, 8)).toBe(8);
		// Hard against the edge already: it does not slide, it only turns.
		expect(slideAt(SLACK + 400, 0)).toBe(0);
	});
});

describe('progress', () => {
	it('is nothing while the paper is only sliding', () => {
		expect(progress(0, WIDE, LEAD)).toBe(0);
		expect(progress(SLACK, WIDE, LEAD)).toBe(0);
		// A tap is never perfectly still; the paper must not twitch under one.
		expect(progress(SLACK - 1, WIDE, LEAD)).toBe(0);
		// Still sliding, so still flat — and so the near edge is still unweighted.
		expect(progress(SLACK + LEAD - 1, WIDE, LEAD)).toBe(0);
		expect(progress(SLACK + LEAD, WIDE, LEAD)).toBe(0);
	});

	it('waits out the overdrag after the slide has run out', () => {
		// Hard against the screen and being pushed, and still not turning.
		expect(progress(SLACK + LEAD + OVER - 1, WIDE, LEAD)).toBe(0);
		expect(progress(SLACK + LEAD + OVER, WIDE, LEAD)).toBe(0);
	});

	it('counts from the end of the overdrag, not from the touch', () => {
		expect(progress(SLACK + LEAD + OVER + 39, WIDE, LEAD)).toBeCloseTo(39 / WIDE, 6);
	});

	it('still waits out the overdrag when there was no room to slide into', () => {
		// No slide at all, but the push before the paper gives in is the same.
		expect(progress(SLACK + OVER, WIDE, 0)).toBe(0);
		expect(progress(SLACK + OVER + 39, WIDE, 0)).toBeCloseTo(39 / WIDE, 6);
	});

	it('stops at the whole width, however far the hand goes', () => {
		expect(progress(WIDE * 4, WIDE, LEAD)).toBe(1);
	});

	it('is nothing on paper with no width, rather than infinite', () => {
		// A panel measured before it is laid out, which is a division by zero.
		expect(progress(50, 0, LEAD)).toBe(0);
		expect(progress(50, -10, LEAD)).toBe(0);
		expect(progress(50, Number.NaN, LEAD)).toBe(0);
	});

	it('reads a push either way, because the paper follows the hand', () => {
		// It used to answer nought to anything leftwards, on the reasoning that
		// there was one way round. The paper goes the way it is pushed now.
		expect(progress(-500, WIDE, LEAD)).toBe(progress(500, WIDE, LEAD));
		expect(progress(-500, WIDE, LEAD)).toBeGreaterThan(0);
	});
});

describe('angleAt', () => {
	it('turns the paper a quarter and no further', () => {
		expect(angleAt(WIDE * 2, WIDE, LEAD)).toBe(QUARTER);
		expect(angleAt(-WIDE * 2, WIDE, LEAD)).toBe(-QUARTER);
	});

	it('goes the way it is pushed, and equally far either way', () => {
		// One rotation, and the hand on it decides which way round. Neither face
		// has a direction of its own; both are carried by whoever is pushing.
		const travelled = 120;
		expect(angleAt(travelled, WIDE, LEAD)).toBe(-angleAt(-travelled, WIDE, LEAD));
	});

	it('leaves the paper flat for the whole of the lead-in', () => {
		expect(angleAt(SLACK, WIDE, LEAD)).toBe(0);
		expect(angleAt(SLACK + LEAD, WIDE, LEAD)).toBe(0);
		expect(angleAt(SLACK + LEAD + OVER, WIDE, LEAD)).toBe(0);
		// And for the whole of it in the other direction too.
		expect(angleAt(-(SLACK + LEAD + OVER), WIDE, LEAD)).toBe(0);
	});
});

describe('pushOf', () => {
	it('reads a push rightwards as one way and leftwards as the other', () => {
		expect(pushOf(40)).toBe(1);
		expect(pushOf(-40)).toBe(-1);
	});

	it('calls a push of nothing the way a tap goes', () => {
		// A gesture that never moved has no direction to report, and agreeing
		// with a tap is the only answer that cannot surprise anyone.
		expect(pushOf(0)).toBe(1);
	});
});

describe('axisAt', () => {
	it('sits in the middle while nothing is being dragged', () => {
		expect(axisAt(0, WIDE, LEAD)).toBe(50);
	});

	it('wanders with the drag, and no further than the drift', () => {
		expect(axisAt(WIDE * 2, WIDE, LEAD)).toBe(50 + DRIFT);
		expect(axisAt(SLACK + LEAD + OVER + WIDE / 2, WIDE, LEAD)).toBeCloseTo(50 + DRIFT / 2, 6);
	});

	it('goes off the middle the way the finger went, either way', () => {
		// A hand shoving the paper leftwards carries the point it turns about
		// leftwards with it. It used to sit still for anything but a push right.
		expect(axisAt(-(WIDE * 2), WIDE, LEAD)).toBe(50 - DRIFT);
		expect(axisAt(-200, WIDE, LEAD)).toBeLessThan(50);
	});
});

describe('commits', () => {
	/** Everything before the paper turns at all, in pixels. */
	const DEAD = SLACK + LEAD + OVER;

	it('finishes the turn once a quarter of the paper has gone by', () => {
		expect(commits(DEAD + WIDE * 0.26, 800, WIDE, LEAD)).toBe(true);
		expect(commits(DEAD + WIDE * 0.24, 800, WIDE, LEAD)).toBe(false);
	});

	it('measures both thresholds on the turn, not on the whole drag', () => {
		// A flick of forty-one pixels that went entirely into the slide and the
		// push after it has not turned the paper at all, and commits nothing.
		expect(commits(41, 100, WIDE, LEAD)).toBe(false);
		expect(commits(DEAD + 41, 100, WIDE, LEAD)).toBe(true);
	});

	it('takes a flick as an answer, short but fast', () => {
		expect(commits(DEAD + 41, 200, WIDE, LEAD)).toBe(true);
		// Far enough but too slow to be a flick, and short of the quarter.
		expect(commits(DEAD + 41, 400, WIDE, LEAD)).toBe(false);
		// Fast enough but too short to be a flick.
		expect(commits(DEAD + 39, 100, WIDE, LEAD)).toBe(false);
	});

	it('measures the flick in the hand, not in the paper', () => {
		// The same flick answers the same on a phone and on a desktop, where
		// the paper is wider — a hand does not know how wide the paper is.
		expect(commits(SLACK + OVER + 60, 150, 320, 0)).toBe(true);
		expect(commits(SLACK + OVER + 60, 150, 544, 0)).toBe(true);
	});

	it('commits on a drag either way, since either turns the paper', () => {
		// Measured on the reach of the push rather than on its sign, so the same
		// movement mirrored asks exactly as much of the hand.
		expect(commits(-300, 100, WIDE, LEAD)).toBe(commits(300, 100, WIDE, LEAD));
		expect(commits(-300, 100, WIDE, LEAD)).toBe(true);
		// And a short one still does not, whichever way it went.
		expect(commits(-30, 400, WIDE, LEAD)).toBe(false);
	});
});
