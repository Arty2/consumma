import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { handCheck, handRect } from '../src/lib/draw/hand.ts';
import { seedFrom } from '../src/lib/draw/rng.ts';

/**
 * Installability needs raster icons, which sits awkwardly beside the rule that
 * the repository contains no image files. Resolved at the build rather than in
 * the repository: the mark is drawn with the same primitives as everything
 * else on the sheet, then rasterised here. Nothing raster is authored or
 * committed — static/icons is generated and gitignored.
 *
 * The mark is a single hand-drawn checkbox with the half-done diagonal through
 * it. It is the app's only glyph, and it means "partly done", which is the
 * more interesting half of what this thing is for.
 */

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'static', 'icons');

const SIZE = 512;

function mark(padding: number): string {
	const box = SIZE - padding * 2;
	const seed = seedFrom('consumma');

	const square = handRect(box, box, { seed, wobble: 7, overshoot: 12 });
	const diagonal = handCheck(box, { seed, wobble: 7 });

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
	<rect width="${SIZE}" height="${SIZE}" fill="#ffffff"/>
	<g transform="translate(${padding} ${padding})" fill="none" stroke="#000000" stroke-width="16" stroke-linecap="round" stroke-linejoin="round">
		<path d="${square}"/>
		<path d="${diagonal}"/>
	</g>
</svg>`;
}

/** Maskable icons are cropped to a circle, so the mark needs more room. */
const plain = Buffer.from(mark(48));
const maskable = Buffer.from(mark(110));

const targets = [
	{ file: 'icon-192.png', size: 192, svg: plain },
	{ file: 'icon-512.png', size: 512, svg: plain },
	{ file: 'icon-maskable-512.png', size: 512, svg: maskable },
	{ file: 'apple-touch-icon.png', size: 180, svg: plain }
];

await mkdir(out, { recursive: true });

for (const target of targets) {
	const png = await sharp(target.svg).resize(target.size, target.size).png().toBuffer();
	await writeFile(join(out, target.file), png);
	process.stdout.write(`  static/icons/${target.file}\n`);
}

process.stdout.write('icons drawn\n');
