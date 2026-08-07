import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { merge } from '../src/lib/doc/merge';
import { emptyDoc, type Doc } from '../src/lib/doc/types';
import { arbDoc } from './arbitrary';

/*
 * The sync loop assumes merge is a pointwise maximum over a total order. If it
 * is not commutative, two devices reach different documents from the same
 * pair of edits and never converge. If it is not associative, the order sync
 * happens to run in changes the result. If it is not idempotent, syncing twice
 * is not the same as syncing once.
 *
 * These are not illustrative examples: fast-check generates documents that
 * collide on ids and stamps, which is where convergence bugs actually live.
 */

const runs = { numRuns: 500 };

describe('merge', () => {
	it('is commutative', () => {
		fc.assert(
			fc.property(arbDoc, arbDoc, (a, b) => {
				expect(merge(a, b)).toStrictEqual(merge(b, a));
			}),
			runs
		);
	});

	it('is associative', () => {
		fc.assert(
			fc.property(arbDoc, arbDoc, arbDoc, (a, b, c) => {
				expect(merge(merge(a, b), c)).toStrictEqual(merge(a, merge(b, c)));
			}),
			runs
		);
	});

	it('is idempotent', () => {
		fc.assert(
			fc.property(arbDoc, arbDoc, (a, b) => {
				const once = merge(a, b);
				expect(merge(once, b)).toStrictEqual(once);
			}),
			runs
		);
	});

	it('merges a document with itself to itself', () => {
		fc.assert(
			fc.property(arbDoc, (a) => {
				expect(merge(a, a)).toStrictEqual(a);
			}),
			runs
		);
	});

	it('is the identity against an empty document', () => {
		fc.assert(
			fc.property(arbDoc, (a) => {
				expect(merge(a, emptyDoc())).toStrictEqual(a);
			}),
			runs
		);
	});

	it('never drops a key either side holds', () => {
		fc.assert(
			fc.property(arbDoc, arbDoc, (a, b) => {
				const merged = merge(a, b);
				const tasks = new Set([...Object.keys(a.tasks), ...Object.keys(b.tasks)]);
				const groups = new Set([...Object.keys(a.groups), ...Object.keys(b.groups)]);

				expect(new Set(Object.keys(merged.tasks))).toStrictEqual(tasks);
				expect(new Set(Object.keys(merged.groups))).toStrictEqual(groups);
			}),
			runs
		);
	});
});

describe('merge, field by field', () => {
	const at = (t: number, c = 'one') => ({ t, c });

	function docWith(task: Partial<Doc['tasks'][string]> & { id: string }): Doc {
		const s = at(1);
		return {
			v: 1,
			groups: {},
			tasks: {
				[task.id]: {
					groupId: 'g1',
					text: 'Bread',
					state: 'todo',
					order: 'a0',
					deleted: false,
					stamps: { text: s, state: s, order: s, groupId: s, deleted: s },
					...task
				}
			}
		};
	}

	it('keeps a rename and a tick from different devices', () => {
		const renamed = docWith({
			id: 'a',
			text: 'Sourdough',
			stamps: {
				text: at(5, 'one'),
				state: at(1),
				order: at(1),
				groupId: at(1),
				deleted: at(1)
			}
		});

		const ticked = docWith({
			id: 'a',
			state: 'done',
			stamps: {
				text: at(1),
				state: at(4, 'two'),
				order: at(1),
				groupId: at(1),
				deleted: at(1)
			}
		});

		const merged = merge(renamed, ticked);

		expect(merged.tasks.a.text).toBe('Sourdough');
		expect(merged.tasks.a.state).toBe('done');
	});

	it('breaks a tie on the same millisecond by client id', () => {
		const one = docWith({
			id: 'a',
			text: 'from one',
			stamps: {
				text: at(3, 'one'),
				state: at(1),
				order: at(1),
				groupId: at(1),
				deleted: at(1)
			}
		});

		const two = docWith({
			id: 'a',
			text: 'from two',
			stamps: {
				text: at(3, 'two'),
				state: at(1),
				order: at(1),
				groupId: at(1),
				deleted: at(1)
			}
		});

		expect(merge(one, two).tasks.a.text).toBe('from two');
		expect(merge(two, one).tasks.a.text).toBe('from two');
	});

	it('keeps a tombstone rather than removing the key', () => {
		const deleted = docWith({
			id: 'a',
			text: '',
			deleted: true,
			stamps: {
				text: at(9),
				state: at(1),
				order: at(1),
				groupId: at(1),
				deleted: at(9)
			}
		});

		const alive = docWith({ id: 'a' });
		const merged = merge(deleted, alive);

		expect(merged.tasks.a).toBeDefined();
		expect(merged.tasks.a.deleted).toBe(true);
	});
});
