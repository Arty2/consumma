import { describe, expect, it } from 'vitest';
import { lands, leftwards, moved, pullAt, REACH } from '../src/lib/dnd/swipe';
import { SLACK } from '../src/lib/turn';

/*
 * The arithmetic behind pulling a task off the list. It decides three things
 * and nothing else: whether the hand has said anything yet, whether what it
 * said was a pull, and how far it has gone — so it is worth pinning here rather
 * than only through a browser, where all three are one movement.
 */

describe('moved', () => {
	it('says nothing at all about a tap that was not quite still', () => {
		expect(moved(0, 0)).toBe(false);
		expect(moved(-SLACK, 0)).toBe(false);
		expect(moved(2, -2)).toBe(false);
	});

	it('is measured in every direction, not only the one that counts', () => {
		// Otherwise a finger going down the page has moved nought sideways and
		// the question of what it is doing is never asked.
		expect(moved(0, -SLACK - 1)).toBe(true);
		expect(moved(-SLACK - 1, 0)).toBe(true);
	});
});

describe('leftwards', () => {
	it('is a pull when the hand is plainly going that way', () => {
		expect(leftwards(-20, 0)).toBe(true);
		expect(leftwards(-20, 12)).toBe(true);
	});

	it('is not one when the sheet is being scrolled', () => {
		expect(leftwards(-12, 20)).toBe(false);
		expect(leftwards(0, 30)).toBe(false);
	});

	it('is not one when the paper is being turned over', () => {
		// Rightwards is the other gesture on the same finger, and the two are
		// told apart by direction alone.
		expect(leftwards(30, 0)).toBe(false);
		expect(leftwards(30, -5)).toBe(false);
	});

	it('refuses the diagonal rather than guessing at it', () => {
		expect(leftwards(-20, 20)).toBe(false);
		expect(leftwards(-20, -20)).toBe(false);
	});
});

describe('pullAt', () => {
	it('does not move the row under a tap that was not quite still', () => {
		expect(pullAt(0)).toBe(0);
		expect(pullAt(-SLACK)).toBe(0);
	});

	it('follows the finger from there', () => {
		expect(pullAt(-SLACK - 5)).toBe(5);
		expect(pullAt(-SLACK - REACH)).toBe(REACH);
	});

	it('is nothing at all when the hand is going the other way', () => {
		expect(pullAt(40)).toBe(0);
	});

	it('goes on past where the row stops', () => {
		// How far the row itself may go is the paper's margin, and that cap is
		// in the stylesheet. This is the hand, and the hand keeps going.
		expect(pullAt(-500)).toBe(500 - SLACK);
	});
});

describe('lands', () => {
	it('does not land a pull that has not reached', () => {
		expect(lands(-SLACK - REACH + 1)).toBe(false);
		expect(lands(-SLACK)).toBe(false);
		expect(lands(0)).toBe(false);
	});

	it('lands the moment it reaches, rather than on the release', () => {
		expect(lands(-SLACK - REACH)).toBe(true);
		expect(lands(-SLACK - REACH - 200)).toBe(true);
	});

	it('never lands on a movement the other way', () => {
		expect(lands(400)).toBe(false);
	});
});
