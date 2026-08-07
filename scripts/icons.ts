import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { handBracket, handCross } from '../src/lib/draw/hand.ts';
import { seedFrom } from '../src/lib/draw/rng.ts';

/**
 * Installability needs raster icons, which sits awkwardly beside the rule that
 * the repository contains no image files. Resolved at the build rather than in
 * the repository: the mark is drawn with the same primitives as everything
 * else on the sheet, then rasterised here. Nothing raster is authored or
 * committed — static/icons is generated and gitignored.
 *
 * The mark is `[x]` — the markdown token for a task that is done, which is
 * what this app reads, writes and exports. Drawn rather than typed: Graphe has
 * no brackets, and an icon is the one place the fallback face cannot follow.
 */

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'static', 'icons');

const SIZE = 512;

function mark(padding: number): string {
	const box = SIZE - padding * 2;
	const seed = seedFrom('consumma');

	/*
	 * Set as a run of three glyphs rather than spread across the box: bracket,
	 * cross, bracket, each close enough to the next to read as one token.
	 * Spaced to the edges instead, the brackets stop being brackets and start
	 * being crop marks with something floating between them.
	 *
	 * The height is the bracket's; the cross is smaller, the way an x sits
	 * inside brackets that reach above and below it.
	 */
	const height = box * 0.72;
	const bracketWidth = height * 0.2;
	const ink = height * 0.5;
	const gap = height * 0.07;

	/*
	 * handCross draws inside its box with a margin — see the `pad` in handCheck
	 * — so its size is not the width of the mark it makes. Spacing against the
	 * box left a third again as much air as asked for, and the brackets drifted
	 * off into crop marks. Everything below is laid out against the ink.
	 */
	const CROSS_PAD = 0.22;
	const crossSize = ink / (1 - CROSS_PAD * 2);

	const run = bracketWidth * 2 + gap * 2 + ink;
	const x = (box - run) / 2;
	const top = (box - height) / 2;

	const left = handBracket(bracketWidth, height, 'left', { seed, wobble: 7 });
	const right = handBracket(bracketWidth, height, 'right', { seed: seed + 401, wobble: 7 });
	const cross = handCross(crossSize, { seed: seed + 977, wobble: 7 });

	const crossX = x + bracketWidth + gap - crossSize * CROSS_PAD;

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
	<rect width="${SIZE}" height="${SIZE}" fill="#ffffff"/>
	<g transform="translate(${padding} ${padding})" fill="none" stroke="#000000" stroke-width="16" stroke-linecap="round" stroke-linejoin="round">
		<path d="${left}" transform="translate(${x} ${top})"/>
		<path d="${cross}" transform="translate(${crossX} ${(box - crossSize) / 2})"/>
		<path d="${right}" transform="translate(${x + run - bracketWidth} ${top})"/>
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
