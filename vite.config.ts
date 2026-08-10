import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-vercel';
import { sveltekit } from '@sveltejs/kit/vite';

/*
 * The version in the footer is read from package.json rather than written out
 * a second time, so releasing cannot leave the sheet claiming an old one.
 */
const { version } = JSON.parse(readFileSync('./package.json', 'utf8'));

export default defineConfig({
	define: {
		__VERSION__: JSON.stringify(version)
	},
	build: {
		// Never inline an asset as a data: URI. `img-src 'self'` refuses them, and
		// a violation that only appears once an asset drops under the size
		// threshold is exactly the kind of surprise a strict CSP should not have.
		assetsInlineLimit: 0
	},
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// Pinned rather than adapter-auto so CI and Vercel build identically.
			adapter: adapter({ runtime: 'nodejs22.x' }),

			/*
			 * The app holds a secret in the browser — the code, and the key derived
			 * from it. One successful script injection exfiltrates it and every
			 * list it opens. That single fact sets the posture: the browser talks
			 * to nothing but its own origin, and no string from anywhere becomes
			 * markup.
			 *
			 * Configured here rather than hand-written, because a hand-written CSP
			 * and SvelteKit's hydration script do not coexist. 'auto' uses hashes
			 * for prerendered pages and nonces for dynamic ones.
			 *
			 * `trusted-types svelte-trusted-html` is not optional: Svelte writes
			 * its own templates through innerHTML behind a policy of that name
			 * (sveltejs/svelte#16271, svelte 5.51.0), and Chrome refuses to hydrate
			 * without it allow-listed. Turned on now, while the surface is small,
			 * rather than at M7 when something has quietly started depending on it.
			 */
			csp: {
				mode: 'auto',
				directives: {
					'default-src': ['self'],
					'script-src': ['self'],
					/*
					 * 'self' plus exactly one pinned hash, and nothing else.
					 *
					 * SvelteKit's own #svelte-announcer element carries a hardcoded
					 * style="..." attribute that we do not author and cannot switch
					 * off. 'unsafe-hashes' is what lets a hash apply to a style
					 * attribute at all — it does not permit inline styles generally,
					 * only this one exact string. Nothing in src/ has a style
					 * attribute, and every dynamic value goes through the CSSOM,
					 * which Svelte's style: directive compiles to and which CSP does
					 * not govern.
					 *
					 * If a SvelteKit upgrade changes that string, e2e/csp.e2e.ts
					 * fails on the console error rather than the app quietly
					 * shipping a broken policy.
					 */
					'style-src': [
						'self',
						'unsafe-hashes',
						'sha256-S8qMpvofolR8Mpjy4kQvEm7m1q8clzU4dfDH0AmvZjo='
					],
					/*
					 * 'self' plus data:, for exactly one thing: the link underline.
					 *
					 * It is a tile drawn by src/lib/draw and handed to CSS as a
					 * `url()`, because an underline on wrapping inline text has to be
					 * a repeating background and a background cannot be an inline
					 * `<svg>`. The tile is generated in our own code from our own
					 * data — nothing here parses or renders a data: URI that came
					 * from anywhere else.
					 *
					 * What this gives up is small and worth naming: `data:` in
					 * img-src means an injected `<img>` could render bytes of its own
					 * rather than having to fetch them. It cannot send anything —
					 * connect-src is still 'self' alone, which is the directive that
					 * matters for a browser holding a key.
					 */
					'img-src': ['self', 'data:'],
					'font-src': ['self'],
					'connect-src': ['self'],
					'manifest-src': ['self'],
					'worker-src': ['self'],
					'object-src': ['none'],
					'base-uri': ['none'],
					'form-action': ['none'],
					'frame-ancestors': ['none'],
					'require-trusted-types-for': ['script'],
					/*
					 * Two policies, both created by the framework rather than by us:
					 * Svelte's for its own template writes, and SvelteKit's for the
					 * service worker's registration URL. SvelteKit refuses to build
					 * if the second is missing once a worker exists.
					 */
					'trusted-types': ['svelte-trusted-html', 'sveltekit-trusted-url'],
					'upgrade-insecure-requests': true
				}
			}
		})
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}', 'tests/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
