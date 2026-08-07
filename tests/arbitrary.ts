import fc from 'fast-check';
import type { Doc, Group, Stamp, Task } from '../src/lib/doc/types';

/**
 * Generators for the property tests.
 *
 * The id and stamp pools are deliberately tiny: convergence bugs live in
 * collisions, so documents that share ids and stamp times are exactly the
 * interesting ones. A wide pool would generate disjoint documents that merge
 * trivially and prove nothing.
 *
 * `noNullPrototype` because fast-check will otherwise hand out objects made
 * with a null prototype, and toStrictEqual compares prototypes — a real
 * document always comes from JSON.parse or an object literal.
 */

const plain = { noNullPrototype: true } as const;

const groupId = fc.constantFrom('g1', 'g2', 'gone');

export const arbStamp: fc.Arbitrary<Stamp> = fc.record(
	{
		t: fc.integer({ min: 1, max: 6 }),
		c: fc.constantFrom('one', 'two')
	},
	plain
);

const arbGroup = (gid: string): fc.Arbitrary<Group> =>
	fc.record(
		{
			id: fc.constant(gid),
			title: fc.constantFrom('Market', 'House', ''),
			order: fc.constantFrom('a0', 'a1', 'a2'),
			deleted: fc.boolean(),
			stamps: fc.record({ title: arbStamp, order: arbStamp, deleted: arbStamp }, plain)
		},
		plain
	);

const arbTask = (tid: string): fc.Arbitrary<Task> =>
	fc.record(
		{
			id: fc.constant(tid),
			groupId,
			text: fc.constantFrom('Bread', 'Coffee', ''),
			state: fc.constantFrom('todo' as const, 'half' as const, 'done' as const),
			order: fc.constantFrom('a0', 'a1', 'a2'),
			deleted: fc.boolean(),
			stamps: fc.record(
				{
					text: arbStamp,
					state: arbStamp,
					order: arbStamp,
					groupId: arbStamp,
					deleted: arbStamp
				},
				plain
			)
		},
		plain
	);

function records<T>(keys: string[], of: (k: string) => fc.Arbitrary<T>) {
	return fc
		.subarray(keys)
		.chain((chosen) =>
			fc
				.tuple(...chosen.map(of))
				.map((values) => Object.fromEntries(chosen.map((k, i) => [k, values[i]])))
		);
}

export const arbDoc: fc.Arbitrary<Doc> = fc.record(
	{
		v: fc.constant(1 as const),
		groups: records(['g1', 'g2'], arbGroup),
		tasks: records(['a', 'b', 'c', 'd'], arbTask)
	},
	plain
);
