import { describe, expect, it } from 'vitest';
import { langOf } from '../src/lib/doc/lang';

describe('langOf', () => {
	it('leaves text with no Greek in it to inherit the page language', () => {
		expect(langOf('Bread and butter')).toBeUndefined();
		expect(langOf('')).toBeUndefined();
		expect(langOf('12 x 40cm — €8.50')).toBeUndefined();
	});

	it('declares Greek, so capitals drop the tonos', () => {
		expect(langOf('Καφές σκέτος')).toBe('el');
		expect(langOf('όχι')).toBe('el');
	});

	it('declares Greek for unaccented Greek too, so the sheet is consistent', () => {
		// Nothing to correct here, but a screen reader should still not read it
		// as English, and the next edit may well add an accent.
		expect(langOf('ψωμι')).toBe('el');
	});

	it('declares Greek on mixed text, because the rule only touches Greek', () => {
		// The English half uppercases identically either way; the Greek half
		// would keep a tonos it should lose.
		expect(langOf('Bread ψωμί')).toBe('el');
	});

	it('recognises polytonic Greek, which lives in a separate block', () => {
		expect(langOf('ἀγαθός')).toBe('el');
	});

	it('does not treat Coptic as Greek, despite the shared block', () => {
		// Coptic has its own casing and shares no tonos rule.
		expect(langOf('ⲁⲃⲅ')).toBeUndefined();
	});

	it('ignores punctuation that merely sits in the Greek block', () => {
		// U+0387 is the ano teleia; Unicode scripts it as Common, not Greek.
		expect(langOf('a·b')).toBeUndefined();
	});
});
