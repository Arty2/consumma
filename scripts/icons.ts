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

/**
 * Which way round the two colours go. The palette is still #000 and #fff —
 * this only decides which of them is the paper, exactly as --ink and --paper
 * do on the sheet.
 */
type Palette = { paper: string; ink: string };

const ON_PAPER: Palette = { paper: '#ffffff', ink: '#000000' };
const ON_INK: Palette = { paper: '#000000', ink: '#ffffff' };

// Left whole rather than destructured: `ink` below is a length, not a colour.
function mark(padding: number, palette: Palette): string {
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
	<rect width="${SIZE}" height="${SIZE}" fill="${palette.paper}"/>
	<g transform="translate(${padding} ${padding})" fill="none" stroke="${palette.ink}" stroke-width="16" stroke-linecap="round" stroke-linejoin="round">
		<path d="${left}" transform="translate(${x} ${top})"/>
		<path d="${cross}" transform="translate(${crossX} ${(box - crossSize) / 2})"/>
		<path d="${right}" transform="translate(${x + run - bracketWidth} ${top})"/>
	</g>
</svg>`;
}

/*
 * The plain icons are drawn the other way up, because they are the ones a
 * launch screen puts on `background_color` — which is black, so that opening
 * the installed app starts from black rather than flashing white at somebody
 * who is about to be handed a black sheet. Drawn on white they would be a
 * white card sitting in the middle of that black.
 *
 * The launcher icons are not inverted. A maskable icon is what Android cuts
 * its home-screen tile from, and apple-touch-icon is the same tile on iOS —
 * neither is the launch screen, and the app's mark on a home screen full of
 * other apps is not the place to make a statement about the theme.
 *
 * Which icon a browser picks for a splash is not in the specification, so a
 * version that reaches for the maskable one instead would show the mark on
 * white. That is a worse splash, not a broken one.
 */
const splash = Buffer.from(mark(48, ON_INK));
const touch = Buffer.from(mark(48, ON_PAPER));

/** Maskable icons are cropped to a circle, so the mark needs more room. */
const maskable = Buffer.from(mark(110, ON_PAPER));

const targets = [
	{ file: 'icon-192.png', size: 192, svg: splash },
	{ file: 'icon-512.png', size: 512, svg: splash },
	{ file: 'icon-maskable-512.png', size: 512, svg: maskable },
	{ file: 'apple-touch-icon.png', size: 180, svg: touch }
];

await mkdir(out, { recursive: true });

for (const target of targets) {
	const png = await sharp(target.svg).resize(target.size, target.size).png().toBuffer();
	await writeFile(join(out, target.file), png);
	process.stdout.write(`  static/icons/${target.file}\n`);
}

process.stdout.write('icons drawn\n');
