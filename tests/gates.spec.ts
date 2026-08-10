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
	// The asset gate exempts static/icons only while it is gitignored.
	file('.gitignore', 'node_modules\n/static/icons\n');

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

	it('rejects a server module reaching into the crypto module', () => {
		file('src/lib/server/store.ts', "import { derive } from '$lib/crypto/derive';\n");

		const { status, output } = runGates();

		expect(status).toBe(1);
		expect(output).toContain('imports from src/lib/crypto');
	});

	it('allows the crypto module everywhere that is not server code', () => {
		file('src/lib/sync/client.ts', "import { derive } from '$lib/crypto/derive';\n");

		expect(runGates().status).toBe(0);
	});

	it('does not mistake prose about the crypto module for a dependency', () => {
		// Both server modules explain why they must not import it. A gate that
		// fires on the explanation is a gate people learn to route around.
		file(
			'src/lib/server/store.ts',
			'// Nothing here imports from src/lib/crypto, and it never could usefully.\n'
		);

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
		file('static/fonts/graphe-alpha.woff2', 'not really a font\n');

		expect(runGates().status).toBe(0);
	});

	it('allows the icons the build draws, because they are never committed', () => {
		file('static/icons/icon-192.png', 'not really a png\n');

		expect(runGates().status).toBe(0);
	});

	it('refuses that exemption when the directory is not gitignored', () => {
		// Otherwise static/icons becomes the place to hide a committed image.
		file('.gitignore', 'node_modules\n');

		const { status, output } = runGates();

		expect(status).toBe(1);
		expect(output).toContain('not gitignored');
	});

	it('rejects a shadow, since a shadow means grey', () => {
		file('src/app.css', '.sheet {\n\tbox-shadow: 0 1px 2px #0003;\n}\n');

		const { status, output } = runGates();

		expect(status).toBe(1);
		expect(output).toContain('shadow or <img>');
	});

	it('rejects an img element', () => {
		file('src/routes/+page.svelte', '<img alt="" src="/tear.svg" />\n');

		const { status, output } = runGates();

		expect(status).toBe(1);
		expect(output).toContain('shadow or <img>');
	});

	/*
	 * The link underline is the one background-image in the app, and it is
	 * allowed by its exact spelling rather than by relaxing the rule — the
	 * point of the gate is that no second one arrives quietly.
	 */
	it('allows the drawn link underline', () => {
		file('src/app.css', 'a {\n\tbackground-image: var(--underline);\n}\n');

		const { status } = runGates();

		expect(status).toBe(0);
	});

	it('rejects any other background-image', () => {
		file('src/app.css', '.sheet {\n\tbackground-image: url("/paper.png");\n}\n');

		const { status, output } = runGates();

		expect(status).toBe(1);
		expect(output).toContain('not the drawn link underline');
	});

	it('rejects a gradient, which is a grey by another name', () => {
		file('src/app.css', '.fade {\n\tbackground-image: linear-gradient(#000, #fff);\n}\n');

		const { status, output } = runGates();

		expect(status).toBe(1);
		expect(output).toContain('not the drawn link underline');
	});
});
