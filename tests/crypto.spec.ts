import { describe, expect, it } from 'vitest';
import { ENVELOPE_VERSION, open, seal } from '../src/lib/crypto/box';
import {
	CODE_LENGTH,
	ROOM_ID_PATTERN,
	SALT,
	derive,
	formatCode,
	newCode,
	normaliseCode
} from '../src/lib/crypto/derive';

/*
 * PBKDF2 at 300,000 iterations is deliberately slow, so these tests derive a
 * small number of fixed codes and reuse the results.
 */
const ONE = 'a1b2c3d4e5f6';
const TWO = '0123456789ab';

const one = await derive(ONE);
const two = await derive(TWO);

describe('codes', () => {
	it('generates lowercase hex of the agreed length', () => {
		for (let i = 0; i < 20; i++) {
			const code = newCode();
			expect(code).toHaveLength(CODE_LENGTH);
			expect(code).toMatch(/^[0-9a-f]+$/);
		}
	});

	it('generates a different code every time', () => {
		const codes = new Set(Array.from({ length: 50 }, newCode));
		expect(codes.size).toBe(50);
	});

	it('accepts what a person actually types', () => {
		// Read aloud in groups, typed with an autocapitalising keyboard.
		expect(normaliseCode('A1B2 C3D4 E5F6')).toBe(ONE);
		expect(normaliseCode('  a1b2c3d4e5f6  ')).toBe(ONE);
	});

	it('refuses anything that is not a code', () => {
		expect(normaliseCode('a1b2c3')).toBeNull();
		expect(normaliseCode('a1b2c3d4e5f6a')).toBeNull();
		expect(normaliseCode('ghijklmnopqr')).toBeNull();
		expect(normaliseCode('')).toBeNull();
	});

	it('groups for dictation without changing the code', () => {
		expect(formatCode(ONE)).toBe('a1b2 c3d4 e5f6');
		expect(normaliseCode(formatCode(ONE))).toBe(ONE);
	});
});

describe('derivation', () => {
	it('is deterministic — the same code always reaches the same list', async () => {
		const again = await derive(ONE);
		expect(again.roomId).toBe(one.roomId);
	});

	it('produces a roomId the server will accept', () => {
		expect(one.roomId).toMatch(ROOM_ID_PATTERN);
	});

	it('gives different codes different rooms', () => {
		expect(one.roomId).not.toBe(two.roomId);
	});

	it('never lets the key out of the browser', () => {
		// Non-extractable, so nothing in the app — or injected into it — can read
		// the raw bytes back.
		expect(one.key.extractable).toBe(false);
		expect(crypto.subtle.exportKey('raw', one.key)).rejects.toThrow();
	});

	it('keeps the halves independent: roomId reveals nothing about the key', async () => {
		/*
		 * roomId is bytes 0..16 and the key is bytes 32..64 of the same PBKDF2
		 * output. Knowing one half must not let anyone reconstruct the other —
		 * which is exactly what makes it safe to hand roomId to the server.
		 *
		 * The observable form of that: a blob sealed under one code cannot be
		 * opened with a key derived from another, even though the server sees
		 * both room ids.
		 */
		const sealed = await seal(one.key, { v: 1, secret: 'bread' });
		expect(await open(two.key, sealed)).toBeNull();
	});

	it('has the salt frozen', () => {
		// Changing this silently orphans every list that already exists.
		expect(SALT).toBe('consumma:v1');
	});
});

describe('the envelope', () => {
	const doc = {
		v: 1,
		groups: { g1: { title: 'Market' } },
		tasks: { t1: { text: 'Coffee, the dark one', state: 'half' } }
	};

	it('round-trips a document', async () => {
		const sealed = await seal(one.key, doc);
		expect(await open(one.key, sealed)).toStrictEqual(doc);
	});

	it('uses a fresh iv per write, so two seals never match', async () => {
		const a = await seal(one.key, doc);
		const b = await seal(one.key, doc);

		expect(a).not.toBe(b);
		expect(await open(one.key, a)).toStrictEqual(await open(one.key, b));
	});

	it('fails cleanly with the wrong key rather than throwing', async () => {
		const sealed = await seal(one.key, doc);
		await expect(open(two.key, sealed)).resolves.toBeNull();
	});

	it('refuses tampered ciphertext', async () => {
		const sealed = await seal(one.key, doc);
		const bytes = Uint8Array.from(atob(sealed), (c) => c.charCodeAt(0));

		// Flip one bit deep inside the ciphertext.
		bytes[bytes.length - 5] ^= 0x01;
		const tampered = btoa(String.fromCharCode(...bytes));

		await expect(open(one.key, tampered)).resolves.toBeNull();
	});

	it('refuses a truncated envelope', async () => {
		const sealed = await seal(one.key, doc);
		await expect(open(one.key, sealed.slice(0, 8))).resolves.toBeNull();
		await expect(open(one.key, '')).resolves.toBeNull();
		await expect(open(one.key, 'not base64 at all !!')).resolves.toBeNull();
	});

	it('refuses an envelope from a version it does not know', async () => {
		const sealed = await seal(one.key, doc);
		const bytes = Uint8Array.from(atob(sealed), (c) => c.charCodeAt(0));

		expect(bytes[0]).toBe(ENVELOPE_VERSION);
		bytes[0] = 0xff;

		await expect(open(one.key, btoa(String.fromCharCode(...bytes)))).resolves.toBeNull();
	});

	it('compresses, so a repetitive list is much smaller than its JSON', async () => {
		const many = {
			v: 1,
			tasks: Object.fromEntries(
				Array.from({ length: 100 }, (_, i) => [
					`task${i}`,
					{ text: 'Something for Sunday', state: 'todo', groupId: 'g1' }
				])
			)
		};

		const sealed = await seal(one.key, many);
		const json = JSON.stringify(many).length;

		expect(sealed.length).toBeLessThan(json / 2);
	});

	it('keeps a full list well inside the blob cap', async () => {
		const full = {
			v: 1,
			groups: Object.fromEntries(
				Array.from({ length: 20 }, (_, i) => [
					`group${i}`,
					{
						id: `group${i}`,
						title: `Group number ${i}`,
						order: 'a0',
						deleted: false,
						stamps: {
							title: { t: 1786000000000, c: 'abcdefghijkl' },
							order: { t: 1786000000000, c: 'abcdefghijkl' },
							deleted: { t: 1786000000000, c: 'abcdefghijkl' }
						}
					}
				])
			),
			tasks: Object.fromEntries(
				Array.from({ length: 100 }, (_, i) => [
					`task${i}aaaaa`,
					{
						id: `task${i}aaaaa`,
						groupId: 'group1',
						text: `A task of fairly typical length, number ${i}`,
						state: 'todo',
						order: 'a0',
						deleted: false,
						stamps: {
							text: { t: 1786000000000, c: 'abcdefghijkl' },
							state: { t: 1786000000000, c: 'abcdefghijkl' },
							order: { t: 1786000000000, c: 'abcdefghijkl' },
							groupId: { t: 1786000000000, c: 'abcdefghijkl' },
							deleted: { t: 1786000000000, c: 'abcdefghijkl' }
						}
					}
				])
			)
		};

		const sealed = await seal(one.key, full);
		expect(sealed.length).toBeLessThan(128 * 1024);
	});
});
