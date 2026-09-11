import { describe, expect, it } from 'vitest';
import {
	detectLocale,
	LOCALE_NAMES,
	resolveLocale,
	SUPPORTED_LOCALES
} from '../src/lib/i18n/locales';

describe('detectLocale', () => {
	it('matches the primary subtag, case-insensitively', () => {
		expect(detectLocale(['el-GR'])).toBe('el');
		expect(detectLocale(['EL'])).toBe('el');
		expect(detectLocale(['en-US'])).toBe('en');
	});

	it('takes the first of the browser’s own languages that this app has', () => {
		expect(detectLocale(['fr-FR', 'el-CY', 'en'])).toBe('el');
		expect(detectLocale(['fr-FR', 'de-DE'])).toBe('en');
	});

	it('falls back to English when nothing offered matches, or nothing is offered', () => {
		expect(detectLocale([])).toBe('en');
		expect(detectLocale(['fr-FR'])).toBe('en');
	});
});

describe('resolveLocale', () => {
	it('is the detected language until something overrides it', () => {
		expect(resolveLocale('en', null)).toBe('en');
		expect(resolveLocale('el', null)).toBe('el');
	});

	it('is the override once there is one, and stays that whatever set it', () => {
		expect(resolveLocale('en', 'el')).toBe('el');
		expect(resolveLocale('el', 'en')).toBe('en');
	});
});

describe('LOCALE_NAMES', () => {
	it('names every supported locale, in its own script', () => {
		for (const locale of SUPPORTED_LOCALES) {
			expect(LOCALE_NAMES[locale].trim()).not.toBe('');
		}
	});
});
