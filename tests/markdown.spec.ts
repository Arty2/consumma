import { describe, expect, it } from 'vitest';
import { applyImport } from '../src/lib/markdown/apply';
import { fromMarkdown } from '../src/lib/markdown/from';
import { toMarkdown } from '../src/lib/markdown/to';
import { addGroup, addTask, liveGroups, liveTasks, setTaskState } from '../src/lib/doc/ops';
import { createClock, type Ctx } from '../src/lib/doc/stamp';
import { emptyDoc, type Doc } from '../src/lib/doc/types';

function fixedCtx(clientId = 'one'): Ctx {
	let tick = 0;
	return { clientId, clock: createClock(0, () => ++tick) };
}

function sample(): { doc: Doc; ctx: Ctx } {
	const ctx = fixedCtx();
	let doc = addGroup(emptyDoc(), ctx, { id: 'g1', title: 'Group of tasks' });
	doc = addTask(doc, ctx, { id: 't1', groupId: 'g1', text: 'Completed' });
	doc = addTask(doc, ctx, { id: 't2', groupId: 'g1', text: 'To do task' });
	doc = addTask(doc, ctx, { id: 't3', groupId: 'g1', text: 'Half done' });
	doc = setTaskState(doc, ctx, 't1', 'done');
	doc = setTaskState(doc, ctx, 't3', 'half');

	doc = addGroup(doc, ctx, { id: 'g2', title: 'Another group' });
	doc = addTask(doc, ctx, { id: 't4', groupId: 'g2', text: 'Something' });

	return { doc, ctx };
}

describe('export', () => {
	it('writes the format from the build plan', () => {
		expect(toMarkdown(sample().doc)).toBe(
			[
				'## Group of tasks',
				'',
				'- [x] Completed',
				'- [ ] To do task',
				'- [~] Half done',
				'',
				'## Another group',
				'',
				'- [ ] Something',
				''
			].join('\n')
		);
	});

	it('keeps the casing the person typed, not the caps the UI shows', () => {
		const ctx = fixedCtx();
		const doc = addGroup(emptyDoc(), ctx, { id: 'g1', title: 'Weekend jobs' });

		expect(toMarkdown(doc)).toContain('## Weekend jobs');
		expect(toMarkdown(doc)).not.toContain('WEEKEND JOBS');
	});

	it('writes an untitled group before the first heading', () => {
		const ctx = fixedCtx();
		let doc = addGroup(emptyDoc(), ctx, { id: 'g0', title: '' });
		doc = addTask(doc, ctx, { id: 't0', groupId: 'g0', text: 'Loose' });
		doc = addGroup(doc, ctx, { id: 'g1', title: 'Market' });
		doc = addTask(doc, ctx, { id: 't1', groupId: 'g1', text: 'Bread' });

		expect(toMarkdown(doc)).toBe('- [ ] Loose\n\n## Market\n\n- [ ] Bread\n');
	});

	it('skips tombstones and empties to nothing', () => {
		expect(toMarkdown(emptyDoc())).toBe('');
	});
});

describe('import', () => {
	it('reads back exactly what export wrote', () => {
		const parsed = fromMarkdown(toMarkdown(sample().doc));

		expect(parsed).not.toBeNull();
		expect(parsed!.tasks).toBe(4);
		expect(parsed!.groups.map((g) => g.title)).toStrictEqual(['Group of tasks', 'Another group']);
		expect(parsed!.groups[0].tasks).toStrictEqual([
			{ text: 'Completed', state: 'done' },
			{ text: 'To do task', state: 'todo' },
			{ text: 'Half done', state: 'half' }
		]);
	});

	it('accepts the markers other apps use for half done', () => {
		const parsed = fromMarkdown('- [/] one\n- [-] two\n- [~] three\n');
		expect(parsed!.groups[0].tasks.map((t) => t.state)).toStrictEqual(['half', 'half', 'half']);
	});

	it('accepts any bullet, and a bullet with no marker at all', () => {
		const parsed = fromMarkdown('- one\n* two\n+ [x] three\n');

		expect(parsed!.tasks).toBe(3);
		expect(parsed!.groups[0].tasks.map((t) => t.state)).toStrictEqual(['todo', 'todo', 'done']);
	});

	it('accepts a single # as a heading', () => {
		const parsed = fromMarkdown('# Market\n\n- [ ] Bread\n');
		expect(parsed!.groups[0].title).toBe('Market');
	});

	it('puts items before the first heading in an untitled group', () => {
		const parsed = fromMarkdown('- [ ] Loose\n\n## Market\n\n- [ ] Bread\n');

		expect(parsed!.groups[0].title).toBe('');
		expect(parsed!.groups[0].tasks[0].text).toBe('Loose');
		expect(parsed!.groups[1].title).toBe('Market');
	});

	it('keeps a heading that has no items under it', () => {
		const parsed = fromMarkdown('- [ ] Bread\n\n## Empty\n');
		expect(parsed!.groups.map((g) => g.title)).toStrictEqual(['', 'Empty']);
	});

	it('keeps markdown syntax verbatim rather than rendering it', () => {
		const parsed = fromMarkdown('- [ ] **bold** and <script>alert(1)</script>\n');
		expect(parsed!.groups[0].tasks[0].text).toBe('**bold** and <script>alert(1)</script>');
	});

	it('flattens nested items to the top level, in place', () => {
		const parsed = fromMarkdown('- [ ] one\n  - [ ] nested\n- [ ] two\n');
		expect(parsed!.groups[0].tasks.map((t) => t.text)).toStrictEqual(['one', 'nested', 'two']);
	});

	it('refuses anything that is not a task list', () => {
		expect(fromMarkdown('just some prose\n\nand more of it')).toBeNull();
		expect(fromMarkdown('')).toBeNull();
		expect(fromMarkdown('## A heading and nothing else')).toBeNull();
	});
});

describe('applying an import', () => {
	it('adds to what is there, and skips duplicates in the same group', () => {
		const { doc, ctx } = sample();
		const parsed = fromMarkdown('## Group of tasks\n\n- [ ] To do task\n- [ ] Brand new\n')!;

		const result = applyImport(doc, ctx, parsed, 'add');

		expect(result.added).toBe(1);
		expect(result.skipped).toBe(1);
		expect(liveTasks(result.doc).map((t) => t.text)).toContain('Brand new');
	});

	it('adds the same text again when it is in a different group', () => {
		const { doc, ctx } = sample();
		const parsed = fromMarkdown('## Somewhere else\n\n- [ ] To do task\n')!;

		const result = applyImport(doc, ctx, parsed, 'add');

		expect(result.added).toBe(1);
		expect(result.skipped).toBe(0);
	});

	it('replaces everything when asked', () => {
		const { doc, ctx } = sample();
		const parsed = fromMarkdown('## Only this\n\n- [x] One thing\n')!;

		const result = applyImport(doc, ctx, parsed, 'replace');

		expect(liveTasks(result.doc).map((t) => t.text)).toStrictEqual(['One thing']);
		expect(liveTasks(result.doc)[0].state).toBe('done');
	});

	it('refuses cleanly rather than committing past the limit', () => {
		const { doc, ctx } = sample();
		const many = Array.from({ length: 200 }, (_, i) => `- [ ] task ${i}`).join('\n');

		const result = applyImport(doc, ctx, fromMarkdown(many)!, 'add');

		expect(result.refused).toBe('tasks');
		expect(result.added).toBe(0);
		// Nothing was changed at all.
		expect(result.doc).toBe(doc);
	});

	it('puts a headingless paste into the group already on the sheet', () => {
		const { doc, ctx } = sample();
		const parsed = fromMarkdown('- [ ] Brand new\n')!;

		const result = applyImport(doc, ctx, parsed, 'add');

		// Not a new nameless group beside the one you were looking at.
		expect(liveGroups(result.doc)).toHaveLength(2);
		expect(liveTasks(result.doc, liveGroups(result.doc)[0].id).map((t) => t.text)).toContain(
			'Brand new'
		);
	});

	it('still skips a duplicate when the paste has no heading', () => {
		const { doc, ctx } = sample();
		const parsed = fromMarkdown('- [ ] To do task\n- [ ] Brand new\n')!;

		const result = applyImport(doc, ctx, parsed, 'add');

		expect(result.added).toBe(1);
		expect(result.skipped).toBe(1);
	});

	it('makes an untitled group when there is nothing to land in', () => {
		const { ctx } = sample();
		const parsed = fromMarkdown('- [ ] Alone\n')!;

		const result = applyImport(emptyDoc(), ctx, parsed, 'add');

		expect(liveGroups(result.doc)).toHaveLength(1);
		expect(liveGroups(result.doc)[0].title).toBe('');
	});

	it('round-trips a list into an empty sheet', () => {
		const { doc, ctx } = sample();
		const exported = toMarkdown(doc);

		const result = applyImport(emptyDoc(), ctx, fromMarkdown(exported)!, 'add');

		expect(toMarkdown(result.doc)).toBe(exported);
	});
});
