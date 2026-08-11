import { describe, expect, it } from 'vitest';
import { addGroup, deleteGroup } from '../src/lib/doc/ops';
import { createClock, type Ctx } from '../src/lib/doc/stamp';
import { emptyDoc, type Doc } from '../src/lib/doc/types';
import { FIRST_GROUP } from '../src/lib/state/doc.svelte';
import { nameFor, parseIndex, type ListEntry } from '../src/lib/state/lists';

function fixedCtx(clientId = 'one'): Ctx {
	let tick = 0;
	return { clientId, clock: createClock(0, () => ++tick) };
}

const VALID_ID = 'aB3xY9zQ1mN7';

function entry(overrides: Partial<ListEntry> = {}): ListEntry {
	return { id: VALID_ID, legacy: false, createdAt: 1, lastUsedAt: 2, ...overrides };
}

describe('parseIndex', () => {
	it('accepts a well-formed index', () => {
		const index = { v: 1, current: VALID_ID, lists: [entry()] };
		expect(parseIndex(JSON.stringify(index))).toStrictEqual(index);
	});

	it('accepts an index with several entries', () => {
		const other = entry({ id: 'other1234567', legacy: true, createdAt: 3, lastUsedAt: 4 });
		const index = { v: 1, current: VALID_ID, lists: [entry(), other] };
		expect(parseIndex(JSON.stringify(index))).toStrictEqual(index);
	});

	it('returns null for absent storage', () => {
		expect(parseIndex(null)).toBeNull();
	});

	it('returns null for unparsable JSON', () => {
		expect(parseIndex('not json')).toBeNull();
	});

	it('rejects anything that is not an object', () => {
		expect(parseIndex('null')).toBeNull();
		expect(parseIndex('[]')).toBeNull();
		expect(parseIndex('"x"')).toBeNull();
	});

	it('rejects the wrong version', () => {
		expect(parseIndex(JSON.stringify({ v: 2, current: VALID_ID, lists: [] }))).toBeNull();
	});

	it('rejects a missing or malformed current', () => {
		expect(parseIndex(JSON.stringify({ v: 1, lists: [] }))).toBeNull();
		expect(parseIndex(JSON.stringify({ v: 1, current: 1, lists: [] }))).toBeNull();
	});

	it('rejects a lists field that is not an array', () => {
		expect(parseIndex(JSON.stringify({ v: 1, current: VALID_ID, lists: {} }))).toBeNull();
	});

	it('rejects an entry with a malformed id', () => {
		const bad = { ...entry(), id: 'has spaces' };
		expect(parseIndex(JSON.stringify({ v: 1, current: VALID_ID, lists: [bad] }))).toBeNull();
	});

	it('rejects an entry missing legacy, createdAt or lastUsedAt', () => {
		const noLegacy: Record<string, unknown> = { ...entry() };
		delete noLegacy.legacy;
		expect(parseIndex(JSON.stringify({ v: 1, current: VALID_ID, lists: [noLegacy] }))).toBeNull();

		const noCreated: Record<string, unknown> = { ...entry() };
		delete noCreated.createdAt;
		expect(parseIndex(JSON.stringify({ v: 1, current: VALID_ID, lists: [noCreated] }))).toBeNull();

		expect(
			parseIndex(
				JSON.stringify({ v: 1, current: VALID_ID, lists: [{ ...entry(), lastUsedAt: 'x' }] })
			)
		).toBeNull();
	});

	it('rejects a whole index if any one entry is damaged', () => {
		const index = { v: 1, current: VALID_ID, lists: [entry(), { id: 'bad id!' }] };
		expect(parseIndex(JSON.stringify(index))).toBeNull();
	});
});

describe('nameFor', () => {
	let ctx: Ctx;
	let doc: Doc;

	function withGroups() {
		ctx = fixedCtx();
		doc = emptyDoc();
	}

	it('falls back to the default on a document with no groups', () => {
		expect(nameFor(emptyDoc())).toBe(FIRST_GROUP);
	});

	it('reads the first live group in order', () => {
		withGroups();
		doc = addGroup(doc, ctx, { id: 'g1', title: 'Groceries' });
		doc = addGroup(doc, ctx, { id: 'g2', title: 'Errands' });

		expect(nameFor(doc)).toBe('Groceries');
	});

	it('skips a deleted first group in favour of the next live one', () => {
		withGroups();
		doc = addGroup(doc, ctx, { id: 'g1', title: 'Groceries' });
		doc = addGroup(doc, ctx, { id: 'g2', title: 'Errands' });
		doc = deleteGroup(doc, ctx, 'g1');

		expect(nameFor(doc)).toBe('Errands');
	});

	it('falls back to the default when only an untitled group is left', () => {
		withGroups();
		doc = addGroup(doc, ctx, { id: 'g1', title: '' });

		expect(nameFor(doc)).toBe(FIRST_GROUP);
	});

	it('falls back to the default once every group has been deleted', () => {
		withGroups();
		doc = addGroup(doc, ctx, { id: 'g1', title: 'Groceries' });
		doc = deleteGroup(doc, ctx, 'g1');

		expect(nameFor(doc)).toBe(FIRST_GROUP);
	});
});
