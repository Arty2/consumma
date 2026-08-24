import { beforeEach, describe, expect, it } from 'vitest';
import { DragState } from '../src/lib/dnd/drag.svelte';

/*
 * The arithmetic of a drag, without a finger.
 *
 * Everything here is about the one thing the two sides of a drag disagree
 * about: the hit test counts the rows with the carried one taken out, because
 * that is the list it is going back into, while the markup counts every row it
 * draws. A landing rule pointing anywhere but at the boundary the drop will
 * use is worse than no rule at all — it is the app saying one thing and doing
 * another — so this is where the translation is pinned down.
 */

let drag: DragState;

beforeEach(() => {
	drag = new DragState();
});

/** Three rows in `g1`, carrying the one at `index`. */
function lift(index: number, groupId = 'g1') {
	drag.taskId = 't';
	drag.from = { groupId, index };
}

describe('isLanding', () => {
	it('draws nothing while there is no target', () => {
		lift(0);
		expect(drag.isLanding('g1', 0)).toBe(false);
	});

	it('draws nothing in a group the target is not in', () => {
		lift(0);
		drag.target = { groupId: 'g2', index: 1 };

		expect(drag.isLanding('g1', 1)).toBe(false);
		expect(drag.isLanding('g2', 1)).toBe(true);
	});

	/*
	 * Carrying the first of three rows down to the boundary between the other
	 * two: the hit test says 1, counting [B, C], and the row that boundary is
	 * above is B — which the markup draws at 2, counting [A, B, C]. Without the
	 * translation the rule was drawn at 1, immediately under the carried row
	 * itself, which is an offer to put it back where it already is.
	 */
	it('draws below the hole the carried row left, not above it', () => {
		lift(0);
		drag.target = { groupId: 'g1', index: 1 };

		expect(drag.isLanding('g1', 1)).toBe(false);
		expect(drag.isLanding('g1', 2)).toBe(true);
	});

	it('draws where it is asked above that hole', () => {
		lift(2);
		drag.target = { groupId: 'g1', index: 1 };

		expect(drag.isLanding('g1', 1)).toBe(true);
		expect(drag.isLanding('g1', 2)).toBe(false);
	});

	/* The end of a group of three is drawn after the third row, at 3. */
	it('draws the end of the group after the last row', () => {
		lift(0);
		drag.target = { groupId: 'g1', index: 2 };

		expect(drag.isLanding('g1', 3)).toBe(true);
	});

	/*
	 * A row carried into another group is not counted out of that group's own
	 * list, so the two sides already agree and nothing is translated.
	 */
	it('does not translate a drop into another group', () => {
		lift(0, 'g1');
		drag.target = { groupId: 'g2', index: 0 };

		expect(drag.isLanding('g2', 0)).toBe(true);
		expect(drag.isLanding('g2', 1)).toBe(false);
	});
});

describe('isGroupLanding', () => {
	it('draws below the hole the carried group left', () => {
		drag.groupId = 'g1';
		drag.groupFrom = 0;
		drag.groupTarget = 1;

		expect(drag.isGroupLanding(1)).toBe(false);
		expect(drag.isGroupLanding(2)).toBe(true);
	});

	it('draws where it is asked above it', () => {
		drag.groupId = 'g3';
		drag.groupFrom = 2;
		drag.groupTarget = 1;

		expect(drag.isGroupLanding(1)).toBe(true);
	});
});

describe('reset', () => {
	it('puts every part of the drag down at once', () => {
		lift(1);
		drag.target = { groupId: 'g1', index: 0 };
		drag.groupId = 'g2';
		drag.groupFrom = 1;
		drag.groupTarget = 0;

		drag.reset();

		expect(drag.dragging).toBe(false);
		expect(drag.target).toBeNull();
		expect(drag.from).toBeNull();
		expect(drag.groupTarget).toBeNull();
		expect(drag.groupFrom).toBeNull();
	});
});
