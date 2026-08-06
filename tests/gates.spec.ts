import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/*
 * scripts/gates.sh enforces the rules a linter cannot. A gate that never fires
 * is worth nothing, so each one is exercised against a fixture tree here
 * rather than trusted because it passed on a clean repo.
 *
 * The script cd's to its own parent's parent, so a fixture is a directory
 * holding a copy of it under scripts/ plus whatever src/ and static/ the case
 * needs.
 */

const script = new URL('../scripts/gates.sh', import.meta.url).pathname;

let root: string;

function file(path: string, contents: string) {
	const full = join(root, path);
	mkdirSync(join(full, '..'), { recursive: true });
	writeFileSync(full, contents);
}

function runGates() {
	const result = spawnSync('bash', [join(root, 'scripts/gates.sh')], {
		encoding: 'utf8'
	});
	return { status: result.status, output: result.stdout + result.stderr };
}

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'consumma-gates-'));

	// A minimal clean tree: the gates need src/ and static/ to exist.
	mkdirSync(join(root, 'scripts'), { recursive: true });
	mkdirSync(join(root, 'static'), { recursive: true });
	file('src/routes/+page.svelte', '<main data-sheet></main>\n');
	file('vercel.json', '{}\n');

	spawnSync('cp', [script, join(root, 'scripts/gates.sh')]);
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

describe('gates', () => {
	it('passes on a clean tree', () => {
		expect(runGates().status).toBe(0);
	});

	it('rejects a route from a string to markup', () => {
		file('src/routes/+page.svelte', '<div>{@html untrusted}</div>\n');

		const { status, output } = runGates();

		expect(status).toBe(1);
		expect(output).toContain('markup/script sink');
	});

	it('rejects eval and its relatives', () => {
		file('src/lib/bad.ts', 'export const run = (s: string) => new Function(s);\n');

		const { status, output } = runGates();

		expect(status).toBe(1);
		expect(output).toContain('markup/script sink');
	});

	it('rejects an api route reaching into the crypto module', () => {
		file('src/routes/api/room/+server.ts', "import { derive } from '$lib/crypto/derive';\n");

		const { status, output } = runGates();

		expect(status).toBe(1);
		expect(output).toContain('imports from src/lib/crypto');
	});

	it('allows the crypto module everywhere that is not an api route', () => {
		file('src/lib/sync/client.ts', "import { derive } from '$lib/crypto/derive';\n");

		expect(runGates().status).toBe(0);
	});

	it('rejects a secret-shaped PUBLIC_ name', () => {
		file('src/lib/sync/api.ts', "import { PUBLIC_BLOB_BASE } from '$env/static/public';\n");

		const { status, output } = runGates();

		expect(status).toBe(1);
		expect(output).toContain('looks like a secret');
	});

	it('rejects a committed raster asset', () => {
		file('static/icon-192.png', 'not really a png\n');

		const { status, output } = runGates();

		expect(status).toBe(1);
		expect(output).toContain('raster asset');
	});

	it('rejects a committed icon font while allowing woff2', () => {
		file('static/fonts/icons.ttf', 'not really a font\n');

		expect(runGates().status).toBe(1);

		rmSync(join(root, 'static/fonts/icons.ttf'));
		file('static/fonts/patrick-hand-latin.woff2', 'not really a font\n');

		expect(runGates().status).toBe(0);
	});

	it('rejects a shadow, since a shadow means grey', () => {
		file('src/app.css', '.sheet {\n\tbox-shadow: 0 1px 2px #0003;\n}\n');

		const { status, output } = runGates();

		expect(status).toBe(1);
		expect(output).toContain('shadow, background-image or <img>');
	});

	it('rejects an img element', () => {
		file('src/routes/+page.svelte', '<img alt="" src="/tear.svg" />\n');

		const { status, output } = runGates();

		expect(status).toBe(1);
		expect(output).toContain('shadow, background-image or <img>');
	});
});
