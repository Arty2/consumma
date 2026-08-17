import { describe, expect, it } from 'vitest';
import { en } from '../src/lib/i18n/en';
import { t } from '../src/lib/i18n';

/*
 * The catalogue is data, so what is worth testing about it is that none of it
 * is missing and none of it is a lie.
 *
 * Two rules. Every plain string says something. And every string that is a
 * function of a count has actually been called with both a one and a many —
 * which is the only way an English plural is ever wrong, and the only kind of
 * mistake a type checker cannot see. The table below is what makes the second
 * rule bite: a function added to the catalogue without an entry here fails the
 * suite by name, rather than sitting untested until somebody reads `1 tasks`.
 */

type Node = string | ((arg: never) => string) | { [key: string]: Node };

/** Every leaf in the catalogue, as `section.name`. */
function walk(node: Node, path: string[] = []): { path: string; leaf: Node }[] {
	if (typeof node === 'string' || typeof node === 'function') {
		return [{ path: path.join('.'), leaf: node }];
	}

	return Object.entries(node).flatMap(([key, value]) => walk(value, [...path, key]));
}

const leaves = walk(en as unknown as Node);

/**
 * Every function in the catalogue, with arguments that exercise it — both ends
 * of a plural where there is one, so `1 task` and `2 tasks` are both read here
 * before anybody reads them on a phone.
 */
const calls: Record<string, unknown[]> = {
	'sheet.over': [{ count: 101, max: 100 }],
	'sheet.movedWithin': [{ position: 2, group: 'Weekend' }],
	'sheet.movedTo': [{ group: 'Weekend', position: 1 }],
	'toast.removed': [{ what: 'Weekend' }],
	'toast.removedWithDone': [{ what: 'Weekend', count: 3 }],
	'toast.cleared': [{ count: 4 }],
	'toast.copied': [{ count: 1 }, { count: 2 }],
	'toast.added': [{ count: 3 }],
	'toast.addedSkipped': [{ count: 3, skipped: 1 }],
	'toast.overTasks': [{ max: 100 }],
	'toast.overGroups': [{ max: 20 }],
	'menu.syncCooling': [{ seconds: 7 }],
	'menu.joinAsk': [{ count: 1 }, { count: 2 }],
	'menu.debug': [{ on: true }, { on: false }],
	'sync.waiting': [{ count: 1 }, { count: 2 }],
	'sync.unseen': [{ count: 1 }, { count: 2 }],
	'sync.buttonWaiting': [{ count: 1 }, { count: 2 }],
	'sync.errorRefused': [{ code: 502 }],
	'sync.errorOther': [{ message: 'boom' }],
	'import.summary': [
		{ tasks: 1, groups: 1 },
		{ tasks: 2, groups: 2 }
	],
	'confirm.clearBody': [{ count: 1 }, { count: 2 }],
	'confirm.leaveBody': [{ code: '5e6b 7c1a 93f2' }],
	'confirm.leaveUnsent': [{ count: 1 }, { count: 2 }]
};

describe('the catalogue', () => {
	it('says something everywhere it says anything', () => {
		const empty = leaves
			.filter(({ leaf }) => typeof leaf === 'string' && leaf.trim() === '')
			.map(({ path }) => path);

		expect(empty).toStrictEqual([]);
	});

	it('is the same object `t` hands out', () => {
		expect(t).toBe(en);
	});

	it('has a sample argument for every string that takes one', () => {
		const functions = leaves
			.filter(({ leaf }) => typeof leaf === 'function')
			.map(({ path }) => path);

		const untested = functions.filter((path) => !(path in calls));
		expect(untested, 'add these to `calls` above').toStrictEqual([]);

		// And nothing lingering in the table for a string that has since gone.
		const stale = Object.keys(calls).filter((path) => !functions.includes(path));
		expect(stale, 'these are no longer in the catalogue').toStrictEqual([]);
	});

	it('builds a sentence for every argument it is given', () => {
		for (const { path, leaf } of leaves) {
			if (typeof leaf !== 'function') continue;

			for (const argument of calls[path]) {
				const said = (leaf as (arg: unknown) => string)(argument);
				expect(typeof said, path).toBe('string');
				expect(said.trim(), path).not.toBe('');
			}
		}
	});

	it('agrees with itself about one and about many', () => {
		expect(en.toast.copied({ count: 1 })).toContain('1 task.');
		expect(en.toast.copied({ count: 2 })).toContain('2 tasks.');
		expect(en.sync.waiting({ count: 1 })).toBe('1 change is waiting to go.');
		expect(en.sync.waiting({ count: 3 })).toBe('3 changes are waiting to go.');
		expect(en.import.summary({ tasks: 1, groups: 1 })).toBe('Add 1 task in 1 group?');
		expect(en.import.summary({ tasks: 2, groups: 3 })).toBe('Add 2 tasks in 3 groups?');
	});
});
