import { beforeEach, describe, expect, it } from 'vitest';
import { clampStamps } from '../src/lib/doc/clamp';
import { gc } from '../src/lib/doc/gc';
import { LIMITS } from '../src/lib/doc/limits';
import { between } from '../src/lib/doc/order';
import {
	addGroup,
	addTask,
	canAddTask,
	clearDone,
	countTasks,
	deleteGroup,
	restoreGroup,
	deleteTask,
	editTask,
	liveTasks,
	moveTask,
	restoreTasks,
	setTaskState
} from '../src/lib/doc/ops';
import { createClock, type Ctx } from '../src/lib/doc/stamp';
import { emptyDoc, type Doc } from '../src/lib/doc/types';
import { LOOSE_ENDS_ID, LOOSE_ENDS_TITLE, view } from '../src/lib/doc/view';
import { validateDoc } from '../src/lib/doc/validate';

let ctx: Ctx;
let doc: Doc;

/** A deterministic clock, so tests do not depend on how fast they run. */
function fixedCtx(clientId = 'one'): Ctx {
	let tick = 0;
	return { clientId, clock: createClock(0, () => ++tick) };
}

beforeEach(() => {
	ctx = fixedCtx();
	doc = addGroup(emptyDoc(), ctx, { id: 'g1', title: 'Market' });
});

describe('adding', () => {
	it('adds a task and keeps it in order', () => {
		doc = addTask(doc, ctx, { id: 't1', groupId: 'g1', text: 'Bread' });
		doc = addTask(doc, ctx, { id: 't2', groupId: 'g1', text: 'Coffee' });

		expect(liveTasks(doc, 'g1').map((t) => t.text)).toStrictEqual(['Bread', 'Coffee']);
	});

	it('refuses an empty task', () => {
		expect(addTask(doc, ctx, { id: 't1', groupId: 'g1', text: '   ' })).toBe(doc);
	});

	it('truncates rather than refusing overlong text', () => {
		doc = addTask(doc, ctx, { id: 't1', groupId: 'g1', text: 'x'.repeat(200) });

		expect(doc.tasks.t1.text).toHaveLength(LIMITS.taskText);
	});

	it('stops adding at the task limit rather than dropping anything', () => {
		for (let i = 0; i < LIMITS.tasks; i++) {
			doc = addTask(doc, ctx, { id: `t${i}`, groupId: 'g1', text: `task ${i}` });
		}

		expect(countTasks(doc)).toBe(LIMITS.tasks);
		expect(canAddTask(doc)).toBe(false);

		const full = doc;
		doc = addTask(doc, ctx, { id: 'over', groupId: 'g1', text: 'one too many' });

		expect(doc).toBe(full);
		expect(countTasks(doc)).toBe(LIMITS.tasks);
	});
});

describe('state', () => {
	beforeEach(() => {
		doc = addTask(doc, ctx, { id: 't1', groupId: 'g1', text: 'Bread' });
	});

	it('moves through the three states', () => {
		expect(doc.tasks.t1.state).toBe('todo');

		doc = setTaskState(doc, ctx, 't1', 'done');
		expect(doc.tasks.t1.state).toBe('done');

		doc = setTaskState(doc, ctx, 't1', 'half');
		expect(doc.tasks.t1.state).toBe('half');
	});

	it('does not restamp a state that is already set', () => {
		const before = doc.tasks.t1.stamps.state;
		doc = setTaskState(doc, ctx, 't1', 'todo');

		expect(doc.tasks.t1.stamps.state).toBe(before);
	});

	it('restamps only the field that changed', () => {
		const stamps = doc.tasks.t1.stamps;
		doc = editTask(doc, ctx, 't1', 'Sourdough');

		expect(doc.tasks.t1.stamps.text.t).toBeGreaterThan(stamps.text.t);
		expect(doc.tasks.t1.stamps.state).toBe(stamps.state);
		expect(doc.tasks.t1.stamps.order).toBe(stamps.order);
	});
});

describe('deleting', () => {
	beforeEach(() => {
		doc = addTask(doc, ctx, { id: 't1', groupId: 'g1', text: 'Bread' });
	});

	it('tombstones rather than removing the key, and drops the text', () => {
		doc = deleteTask(doc, ctx, 't1');

		expect(doc.tasks.t1).toBeDefined();
		expect(doc.tasks.t1.deleted).toBe(true);
		expect(doc.tasks.t1.text).toBe('');
		expect(liveTasks(doc)).toHaveLength(0);
	});

	it('reordering a task does not restamp its neighbours', () => {
		doc = addTask(doc, ctx, { id: 't2', groupId: 'g1', text: 'Coffee' });
		doc = addTask(doc, ctx, { id: 't3', groupId: 'g1', text: 'Milk' });

		const untouched = doc.tasks.t1.stamps.order;
		const order = between(null, doc.tasks.t1.order);
		doc = moveTask(doc, ctx, 't3', { groupId: 'g1', order });

		expect(doc.tasks.t1.stamps.order).toBe(untouched);
		expect(liveTasks(doc, 'g1').map((t) => t.id)).toStrictEqual(['t3', 't1', 't2']);
	});

	it('refuses to move a task into a group id the document could not hold', () => {
		/*
		 * "Loose ends" is assembled on read and its id is not a real one, so a
		 * task moved into it produces a document that fails validation — and the
		 * next load then discards the whole list rather than one task. The drag
		 * can reach it, so the op has to refuse it.
		 */
		const before = doc;
		doc = moveTask(doc, ctx, 't1', { groupId: LOOSE_ENDS_ID, order: 'a5' });

		expect(doc).toBe(before);
		expect(validateDoc(doc)).not.toBeNull();
	});

	it('keeps a document valid after any move it does allow', () => {
		doc = addGroup(doc, ctx, { id: 'g2', title: 'House' });
		doc = moveTask(doc, ctx, 't1', { groupId: 'g2', order: 'a5' });

		expect(validateDoc(doc)).not.toBeNull();
	});

	it('stamps groupId and order together when a task crosses groups', () => {
		doc = addGroup(doc, ctx, { id: 'g2', title: 'House' });
		const before = doc.tasks.t1.stamps;

		doc = moveTask(doc, ctx, 't1', { groupId: 'g2', order: 'a5' });

		expect(doc.tasks.t1.stamps.groupId.t).toBeGreaterThan(before.groupId.t);
		expect(doc.tasks.t1.stamps.order.t).toBeGreaterThan(before.order.t);
	});
});

describe('clear and undo', () => {
	beforeEach(() => {
		doc = addTask(doc, ctx, { id: 't1', groupId: 'g1', text: 'Bread' });
		doc = addTask(doc, ctx, { id: 't2', groupId: 'g1', text: 'Coffee' });
		doc = addTask(doc, ctx, { id: 't3', groupId: 'g1', text: 'Milk' });
		doc = setTaskState(doc, ctx, 't1', 'done');
		doc = setTaskState(doc, ctx, 't2', 'half');
	});

	it('sweeps done tasks and only those', () => {
		const { doc: cleared, cleared: removed } = clearDone(doc, ctx);

		expect(removed).toStrictEqual([{ id: 't1', text: 'Bread' }]);
		expect(liveTasks(cleared).map((t) => t.id)).toStrictEqual(['t2', 't3']);
	});

	it('undo restores the text and stamps forward, never backwards', () => {
		const before = doc.tasks.t1.stamps.deleted.t;
		const { doc: cleared, cleared: removed } = clearDone(doc, ctx);
		const deletedAt = cleared.tasks.t1.stamps.deleted.t;

		const restored = restoreTasks(cleared, ctx, removed);

		expect(restored.tasks.t1.deleted).toBe(false);
		expect(restored.tasks.t1.text).toBe('Bread');
		expect(restored.tasks.t1.stamps.deleted.t).toBeGreaterThan(deletedAt);
		expect(deletedAt).toBeGreaterThan(before);
	});
});

describe('deleteGroup', () => {
	it('takes the tasks in it, rather than leaving them for Loose ends', () => {
		/*
		 * A group is only a name and an order. Marking it deleted on its own left
		 * its tasks with a group id nobody knows, and `view` gathers those into
		 * Loose ends — so emptying a finished group poured its done tasks back
		 * onto the sheet under another heading.
		 */
		doc = addTask(doc, ctx, { id: 't1', groupId: 'g1', text: 'Bread' });
		doc = addTask(doc, ctx, { id: 't2', groupId: 'g1', text: 'Milk' });

		doc = deleteGroup(doc, ctx, 'g1');

		expect(doc.groups.g1.deleted).toBe(true);
		expect(doc.tasks.t1.deleted).toBe(true);
		expect(doc.tasks.t2.deleted).toBe(true);
		expect(view(doc)).toHaveLength(0);
	});

	it('leaves the tasks of another group alone', () => {
		doc = addGroup(doc, ctx, { id: 'g2', title: 'Market' });
		doc = addTask(doc, ctx, { id: 't1', groupId: 'g1', text: 'Bread' });
		doc = addTask(doc, ctx, { id: 't2', groupId: 'g2', text: 'Milk' });

		doc = deleteGroup(doc, ctx, 'g1');

		expect(doc.tasks.t1.deleted).toBe(true);
		expect(doc.tasks.t2.deleted).toBe(false);
	});

	it('is undone by putting the group and its tasks back', () => {
		doc = addTask(doc, ctx, { id: 't1', groupId: 'g1', text: 'Bread' });
		doc = deleteGroup(doc, ctx, 'g1');

		doc = restoreTasks(restoreGroup(doc, ctx, 'g1'), ctx, [{ id: 't1', text: 'Bread' }]);

		const groups = view(doc);
		expect(groups).toHaveLength(1);
		expect(groups[0].tasks.map((t) => t.id)).toStrictEqual(['t1']);
	});

	it('stamps forward, so undo never rewinds', () => {
		doc = deleteGroup(doc, ctx, 'g1');
		const gone = doc.groups.g1.stamps.deleted;

		doc = restoreGroup(doc, ctx, 'g1');

		expect(doc.groups.g1.stamps.deleted.t).toBeGreaterThan(gone.t);
	});
});

describe('view', () => {
	it('surfaces a task whose group is not here under Loose ends', () => {
		/*
		 * Deleting a group takes its tasks with it, so this is what merge
		 * produces rather than what delete does: the other device made the task,
		 * this one never heard of the group.
		 */
		doc = addTask(doc, ctx, { id: 't1', groupId: 'elsewhere', text: 'Bread' });

		const groups = view(doc);

		expect(groups).toHaveLength(2);
		expect(groups[1].title).toBe(LOOSE_ENDS_TITLE);
		expect(groups[1].synthetic).toBe(true);
		expect(groups[1].tasks.map((t) => t.id)).toStrictEqual(['t1']);
	});

	it('does not mutate the document to fix an orphan', () => {
		doc = addTask(doc, ctx, { id: 't1', groupId: 'elsewhere', text: 'Bread' });

		view(doc);

		expect(doc.tasks.t1.groupId).toBe('elsewhere');
	});
});

describe('clamp and gc', () => {
	it('clamps a stamp from a device with a fast clock', () => {
		const skewed = addTask(doc, fixedCtx('two'), {
			id: 't1',
			groupId: 'g1',
			text: 'Bread'
		});
		skewed.tasks.t1.stamps.text = { t: 5_000_000, c: 'two' };

		const clamped = clampStamps(skewed, 1_000_000, 60_000);

		expect(clamped.tasks.t1.stamps.text.t).toBe(1_060_000);
		expect(clamped.tasks.t1.stamps.text.c).toBe('two');
	});

	it('leaves stamps that are not in the future alone', () => {
		doc = addTask(doc, ctx, { id: 't1', groupId: 'g1', text: 'Bread' });
		const clamped = clampStamps(doc, 1_000_000, 60_000);

		expect(clamped.tasks.t1.stamps.text).toStrictEqual(doc.tasks.t1.stamps.text);
	});

	it('collects old tombstones and keeps recent ones and live records', () => {
		const now = 1_000_000_000;
		const old = now - 40 * 24 * 60 * 60 * 1000;

		doc = addTask(doc, ctx, { id: 'old', groupId: 'g1', text: 'Bread' });
		doc = addTask(doc, ctx, { id: 'recent', groupId: 'g1', text: 'Coffee' });
		doc = addTask(doc, ctx, { id: 'live', groupId: 'g1', text: 'Milk' });
		doc = deleteTask(doc, ctx, 'old');
		doc = deleteTask(doc, ctx, 'recent');

		for (const key of Object.keys(doc.tasks.old.stamps)) {
			doc.tasks.old.stamps[key as keyof typeof doc.tasks.old.stamps] = {
				t: old,
				c: 'one'
			};
		}
		for (const key of Object.keys(doc.tasks.recent.stamps)) {
			doc.tasks.recent.stamps[key as keyof typeof doc.tasks.recent.stamps] = {
				t: now - 1000,
				c: 'one'
			};
		}

		const swept = gc(doc, now);

		expect(swept.tasks.old).toBeUndefined();
		expect(swept.tasks.recent).toBeDefined();
		expect(swept.tasks.live).toBeDefined();
	});
});
