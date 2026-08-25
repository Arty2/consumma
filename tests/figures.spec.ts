import { describe, expect, it } from 'vitest';
import { wide } from '../src/lib/figures';

describe('setting a figure fullwidth', () => {
	it('maps every digit', () => {
		expect(wide('0123456789')).toBe('０１２３４５６７８９');
	});

	it('leaves the marks around a price alone', () => {
		expect(wide('1,50€')).toBe('１,５０€');
		expect(wide('2.00$')).toBe('２.００$');
		expect(wide('3£')).toBe('３£');
		expect(wide('12×')).toBe('１２×');
	});

	it('leaves words alone', () => {
		expect(wide('Tomatos')).toBe('Tomatos');
		expect(wide('')).toBe('');
	});

	it('is idempotent, so a figure drawn twice is drawn once', () => {
		expect(wide(wide('42'))).toBe(wide('42'));
	});
});
