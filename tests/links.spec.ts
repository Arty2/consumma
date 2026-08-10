import { describe, expect, it } from 'vitest';
import { abbreviate, hasLink, pieces } from '../src/lib/doc/links';

const link = (text: string) => pieces(text).find((piece) => piece.kind === 'link');

describe('abbreviate', () => {
	it('drops the protocol', () => {
		expect(abbreviate(new URL('https://heracl.es'))).toBe('heracl.es');
		expect(abbreviate(new URL('http://heracl.es'))).toBe('heracl.es');
	});

	it('keeps a single path segment whole', () => {
		expect(abbreviate(new URL('https://heracl.es/consumma'))).toBe('heracl.es/consumma');
	});

	it('shows the first slash, an ellipsis, then the last segment', () => {
		expect(abbreviate(new URL('https://heracl.es/projects/2024/consumma'))).toBe(
			'heracl.es/…/consumma'
		);
	});

	it('drops the query and the fragment, which are how not which', () => {
		expect(abbreviate(new URL('https://heracl.es/a/b?utm=long&more=yes#top'))).toBe(
			'heracl.es/…/b'
		);
	});

	it('ignores a trailing slash rather than counting it as a segment', () => {
		expect(abbreviate(new URL('https://heracl.es/'))).toBe('heracl.es');
		expect(abbreviate(new URL('https://heracl.es/consumma/'))).toBe('heracl.es/consumma');
	});

	it('shows a mailto as the address alone', () => {
		expect(abbreviate(new URL('mailto:someone@heracl.es'))).toBe('someone@heracl.es');
	});
});

describe('pieces', () => {
	it('gives one text piece back when there is no address', () => {
		expect(pieces('2x TOMATOS 5,08')).toStrictEqual([{ kind: 'text', text: '2x TOMATOS 5,08' }]);
	});

	it('keeps the words either side of an address', () => {
		expect(pieces('SEE https://heracl.es/consumma FIRST')).toStrictEqual([
			{ kind: 'text', text: 'SEE ' },
			{ kind: 'link', href: 'https://heracl.es/consumma', label: 'heracl.es/consumma' },
			{ kind: 'text', text: ' FIRST' }
		]);
	});

	it('finds more than one', () => {
		const found = pieces('https://a.example https://b.example');
		expect(found.filter((piece) => piece.kind === 'link')).toHaveLength(2);
	});

	it('keeps the whole address in the href, however it is shown', () => {
		expect(link('https://heracl.es/a/b/c?d=e#f')).toStrictEqual({
			kind: 'link',
			href: 'https://heracl.es/a/b/c?d=e#f',
			label: 'heracl.es/…/c'
		});
	});

	it('gives sentence punctuation back to the sentence', () => {
		expect(link('GO TO https://heracl.es.')?.href).toBe('https://heracl.es/');
		expect(link('(SEE https://heracl.es)')?.href).toBe('https://heracl.es/');
	});

	it('keeps a bracket the address opened for itself', () => {
		expect(link('https://en.wikipedia.org/wiki/Ouzo_(drink)')?.href).toBe(
			'https://en.wikipedia.org/wiki/Ouzo_(drink)'
		);
	});

	/*
	 * The whole reason the schemes are a list rather than a pattern: this app
	 * puts the result in an href, and two of these run code.
	 */
	it('refuses every scheme but https, http and mailto', () => {
		for (const text of [
			'javascript:alert(1)',
			'data:text/html,<script>alert(1)</script>',
			'blob:https://heracl.es/abc',
			'file:///etc/passwd',
			'vbscript:msgbox(1)'
		]) {
			expect(hasLink(text), text).toBe(false);
		}
	});

	/*
	 * An address starts at a boundary or it is not one. Without that rule a
	 * refused scheme is defeated by having an allowed one inside it: the outer
	 * `blob:` falls off the front and what is left links somewhere nobody
	 * wrote.
	 */
	it('does not find an address in the middle of a word', () => {
		expect(hasLink('NOThttps://heracl.es')).toBe(false);
		expect(hasLink('blob:https://heracl.es/abc')).toBe(false);
	});

	it('finds one just inside a bracket or a quote', () => {
		expect(link('(https://heracl.es)')?.href).toBe('https://heracl.es/');
		expect(link('"https://heracl.es"')?.href).toBe('https://heracl.es/');
	});

	it('loses no characters of the original text', () => {
		const text = 'BUY https://heracl.es/a/b NOW, AND https://x.example TOO.';
		const joined = pieces(text)
			.map((piece) => (piece.kind === 'text' ? piece.text : ''))
			.join('');

		// What is left after taking the addresses out is the rest of the line.
		expect(joined).toBe('BUY  NOW, AND  TOO.');
	});
});
