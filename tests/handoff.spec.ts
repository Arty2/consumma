import { describe, expect, it } from 'vitest';
import { handOff } from '../src/lib/doc/handoff';
import { LIMITS } from '../src/lib/doc/limits';
import { addGroup, addTask, liveGroups, liveTasks, setTaskState } from '../src/lib/doc/ops';
import { createClock, type Ctx } from '../src/lib/doc/stamp';
import { emptyDoc, type Doc } from '../src/lib/doc/types';

/*
 * A group carried from one list to another.
 *
 * The thing being pinned down here is that nothing goes missing on the way:
 * ids, text, half-done states and the order the tasks were in all arrive, and
 * what is left behind is a tombstone rather than a hole — which is what lets
 * the undo put the group back where it was rather than rebuild it.
 */

function fixedCtx(clientId = 'one'): Ctx {
	let tick = 0;
	return { clientId, clock: createClock(0, () => ++tick) };
}

/** A list with one group and the tasks named, in the order named. */
function listWith(ctx: Ctx, groupId: string, texts: readonly string[]): Doc {
	let doc = addGroup(emptyDoc(), ctx, { id: groupId, title: 'Weekend' });
	texts.forEach((text, index) => {
		doc = addTask(doc, ctx, { id: `t${index}`, groupId, text });
	});
	return doc;
}

describe('handOff', () => {
	it('carries the group and its tasks whole', () => {
		const ctx = fixedCtx();
		const from = listWith(ctx, 'g1', ['Bread', 'Coffee', 'Milk']);

		const result = handOff(from, emptyDoc(), ctx, 'g1')!;

		expect(result.refused).toBeNull();
		expect(result.moved).toBe(3);
		expect(liveGroups(result.to).map((g) => g.title)).toStrictEqual(['Weekend']);
		expect(liveTasks(result.to, 'g1').map((t) => t.text)).toStrictEqual([
			'Bread',
			'Coffee',
			'Milk'
		]);
	});

	it('keeps every task id and its state', () => {
		const ctx = fixedCtx();
		let from = listWith(ctx, 'g1', ['Bread', 'Coffee']);
		from = setTaskState(from, ctx, 't0', 'done');
		from = setTaskState(from, ctx, 't1', 'half');

		const result = handOff(from, emptyDoc(), ctx, 'g1')!;
		const arrived = liveTasks(result.to, 'g1');

		expect(arrived.map((t) => t.id)).toStrictEqual(['t0', 't1']);
		expect(arrived.map((t) => t.state)).toStrictEqual(['done', 'half']);
	});

	it('leaves the group and its tasks tombstoned where they came from', () => {
		const ctx = fixedCtx();
		const from = listWith(ctx, 'g1', ['Bread']);

		const result = handOff(from, emptyDoc(), ctx, 'g1')!;

		expect(liveGroups(result.from)).toStrictEqual([]);
		expect(liveTasks(result.from)).toStrictEqual([]);
		// Tombstoned, not gone: this is what the undo restores.
		expect(result.from.groups.g1.deleted).toBe(true);
		expect(result.from.tasks.t0.deleted).toBe(true);
	});

	it('lands the group after the ones already there', () => {
		const ctx = fixedCtx();
		const from = listWith(ctx, 'g1', ['Bread']);
		const to = addGroup(emptyDoc(), ctx, { id: 'g0', title: 'Weekdays' });

		const result = handOff(from, to, ctx, 'g1')!;

		expect(liveGroups(result.to).map((g) => g.title)).toStrictEqual(['Weekdays', 'Weekend']);
	});

	/*
	 * Carried over and brought back leaves a tombstone under the same id in the
	 * destination. Carried over again it has to arrive alive — a record written
	 * with anything but a fresh stamp would lose to the tombstone the moment
	 * either device merged.
	 */
	it('overwrites a tombstone it left behind on a previous visit', () => {
		const ctx = fixedCtx();
		const from = listWith(ctx, 'g1', ['Bread']);

		const there = handOff(from, emptyDoc(), ctx, 'g1')!;
		const back = handOff(there.to, there.from, ctx, 'g1')!;
		const again = handOff(back.to, back.from, ctx, 'g1')!;

		expect(liveGroups(again.to).map((g) => g.title)).toStrictEqual(['Weekend']);
		expect(liveTasks(again.to, 'g1').map((t) => t.text)).toStrictEqual(['Bread']);
		expect(again.to.groups.g1.stamps.deleted.t).toBeGreaterThan(back.to.groups.g1.stamps.deleted.t);
	});

	it('refuses a destination that is already full of groups, changing neither', () => {
		const ctx = fixedCtx();
		const from = listWith(ctx, 'g1', ['Bread']);

		let to = emptyDoc();
		for (let i = 0; i < LIMITS.groups; i++) {
			to = addGroup(to, ctx, { id: `full${i}`, title: `Group ${i}` });
		}

		const result = handOff(from, to, ctx, 'g1')!;

		expect(result.refused).toBe('groups');
		expect(result.moved).toBe(0);
		expect(result.from).toBe(from);
		expect(result.to).toBe(to);
	});

	it('refuses a destination that has no room for all the tasks', () => {
		const ctx = fixedCtx();
		let from = addGroup(emptyDoc(), ctx, { id: 'g1', title: 'Weekend' });
		for (let i = 0; i < 3; i++) {
			from = addTask(from, ctx, { id: `t${i}`, groupId: 'g1', text: `Thing ${i}` });
		}

		let to = addGroup(emptyDoc(), ctx, { id: 'g0', title: 'Weekdays' });
		for (let i = 0; i < LIMITS.tasks - 2; i++) {
			to = addTask(to, ctx, { id: `f${i}`, groupId: 'g0', text: `Filler ${i}` });
		}

		const result = handOff(from, to, ctx, 'g1')!;

		expect(result.refused).toBe('tasks');
		expect(result.from).toBe(from);
		expect(result.to).toBe(to);
	});

	it('answers nothing for a group that is not there, or is already gone', () => {
		const ctx = fixedCtx();
		const from = listWith(ctx, 'g1', ['Bread']);
		const moved = handOff(from, emptyDoc(), ctx, 'g1')!;

		expect(handOff(from, emptyDoc(), ctx, 'nope')).toBeNull();
		expect(handOff(moved.from, emptyDoc(), ctx, 'g1')).toBeNull();
	});
});
