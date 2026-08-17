import { afterEach, describe, expect, it, vi } from 'vitest';
import { finished, taken, tapped } from '../src/lib/feel';

/*
 * The phone's one way of answering back.
 *
 * What matters here is that it fires at all and that it never throws: it is
 * absent on desktop and refused outright by iOS Safari, and both of those are
 * ordinary rather than exceptional. A confirmation that could take the app down
 * with it would be worse than no confirmation.
 */

function withVibrate(impl: (pattern: number | number[]) => boolean) {
	const spy = vi.fn(impl);
	Object.defineProperty(globalThis, 'navigator', {
		value: { vibrate: spy },
		configurable: true,
		writable: true
	});
	return spy;
}

afterEach(() => {
	Reflect.deleteProperty(globalThis, 'navigator');
});

describe('feel', () => {
	it('taps once for a thing done', () => {
		const spy = withVibrate(() => true);
		tapped();

		expect(spy).toHaveBeenCalledTimes(1);
		expect(spy.mock.calls[0][0]).toBe(10);
	});

	it('says dot dot for a thing taken away', () => {
		const spy = withVibrate(() => true);
		taken();

		// Two beats and a gap: something is gone, said twice.
		expect(spy.mock.calls[0][0]).toStrictEqual([10, 60, 10]);
	});

	it('says dot dot dash for a thing finished', () => {
		const spy = withVibrate(() => true);
		finished();

		expect(spy.mock.calls[0][0]).toStrictEqual([10, 50, 10, 50, 45]);
	});

	it('never says anything long enough to be a message', () => {
		/*
		 * Three lengths and nothing more. Anything with rhythm enough to be read
		 * as a notification is a notification, and this app does not send those.
		 */
		const spy = withVibrate(() => true);
		tapped();
		taken();
		finished();

		for (const [pattern] of spy.mock.calls) {
			const total = Array.isArray(pattern) ? pattern.reduce((sum, part) => sum + part, 0) : pattern;
			expect(total).toBeLessThan(200);
		}
	});

	it('is quiet on a device that has no way to answer', () => {
		Object.defineProperty(globalThis, 'navigator', {
			value: {},
			configurable: true,
			writable: true
		});

		// Desktop, where there is nothing to vibrate. Everything still works.
		expect(() => tapped()).not.toThrow();
	});

	it('is quiet when the browser refuses outright', () => {
		// iOS Safari, which has the method and throws on it.
		withVibrate(() => {
			throw new Error('not allowed');
		});

		expect(() => finished()).not.toThrow();
	});
});
