import type { Doc, Group, Stamp, Task } from './types';

/**
 * merge(a, b) is a pointwise maximum over a total order, which is what makes
 * it commutative, associative and idempotent — the three properties the sync
 * loop depends on and that tests/merge.spec.ts checks with fast-check.
 *
 * It is pure and takes no clock. Skew clamping (clamp.ts) and tombstone
 * collection (gc.ts) are separate, because both depend on `now` and would
 * destroy the algebra if folded in here.
 *
 * Field-level rather than record-level, so "I renamed it" and "you ticked it"
 * both survive.
 */

/**
 * Orders one field's (value, stamp) pair against another.
 *
 * `t` then `c` is the rule from §4. The final fallback to the value itself is
 * unreachable in practice — the monotonic clock in stamp.ts guarantees one
 * device never issues the same `t` twice, and two devices differ in `c` — but
 * it costs nothing and makes the comparator *total*. Without it a document
 * with two colliding stamps, whether corrupt or hostile, would make merge
 * order-dependent and quietly break convergence.
 */
function wins<V>(value: V, at: Stamp, against: V, atAgainst: Stamp): boolean {
	if (at.t !== atAgainst.t) return at.t > atAgainst.t;
	if (at.c !== atAgainst.c) return at.c > atAgainst.c;
	return String(value) > String(against);
}

function pick<V>(av: V, as: Stamp, bv: V, bs: Stamp): [V, Stamp] {
	return wins(av, as, bv, bs) ? [av, as] : [bv, bs];
}

function mergeGroup(a: Group, b: Group): Group {
	const [title, titleStamp] = pick(a.title, a.stamps.title, b.title, b.stamps.title);
	const [order, orderStamp] = pick(a.order, a.stamps.order, b.order, b.stamps.order);
	const [deleted, deletedStamp] = pick(a.deleted, a.stamps.deleted, b.deleted, b.stamps.deleted);

	return {
		id: a.id,
		title,
		order,
		deleted,
		stamps: { title: titleStamp, order: orderStamp, deleted: deletedStamp }
	};
}

function mergeTask(a: Task, b: Task): Task {
	const [text, textStamp] = pick(a.text, a.stamps.text, b.text, b.stamps.text);
	const [state, stateStamp] = pick(a.state, a.stamps.state, b.state, b.stamps.state);
	const [order, orderStamp] = pick(a.order, a.stamps.order, b.order, b.stamps.order);
	const [groupId, groupStamp] = pick(a.groupId, a.stamps.groupId, b.groupId, b.stamps.groupId);
	const [deleted, deletedStamp] = pick(a.deleted, a.stamps.deleted, b.deleted, b.stamps.deleted);

	return {
		id: a.id,
		groupId,
		text,
		state,
		order,
		deleted,
		stamps: {
			text: textStamp,
			state: stateStamp,
			order: orderStamp,
			groupId: groupStamp,
			deleted: deletedStamp
		}
	};
}

function mergeRecords<T>(
	a: Record<string, T>,
	b: Record<string, T>,
	one: (x: T, y: T) => T
): Record<string, T> {
	// Sorted so the output is byte-identical whichever way round the arguments
	// came, which also keeps the encrypted blob stable across a no-op sync.
	const ids = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();

	const out: Record<string, T> = {};
	for (const id of ids) {
		const x = a[id];
		const y = b[id];
		out[id] = x === undefined ? y : y === undefined ? x : one(x, y);
	}
	return out;
}

export function merge(a: Doc, b: Doc): Doc {
	return {
		v: 1,
		groups: mergeRecords(a.groups, b.groups, mergeGroup),
		tasks: mergeRecords(a.tasks, b.tasks, mergeTask)
	};
}
