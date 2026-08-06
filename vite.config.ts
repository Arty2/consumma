import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-vercel';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// Pinned rather than adapter-auto so CI and Vercel build identically.
			adapter: adapter({ runtime: 'nodejs22.x' })

			// CSP lands in M2, once there is markup to protect. It needs
			// `trusted-types: ['svelte-trusted-html']` alongside
			// `require-trusted-types-for: ['script']` — Svelte creates that policy
			// itself for its internal innerHTML writes, and Chrome refuses to
			// hydrate without it. See sveltejs/svelte#16271 (svelte 5.51.0).
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
