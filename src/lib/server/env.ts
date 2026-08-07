import { env } from '$env/dynamic/private';

/**
 * The blob path prefix for the environment this function is running in.
 *
 * Preview and production get separate stores if the plan allows it; this is
 * the fallback for when they share one, so a preview deploy can never write
 * over a real list. `VERCEL_ENV` is a system variable Vercel sets itself —
 * there is nothing to configure.
 *
 * Production is deliberately unprefixed. Giving it one would change the path
 * of every list that already exists and orphan all of them, in exactly the way
 * changing the salt would; the prefix exists to move the *other* environments
 * out of the way, not to tidy production.
 *
 * Note that Vercel only runs crons in production, so preview blobs are never
 * swept and will accumulate. That is an argument for separate stores rather
 * than against the prefix — but if they do share one, clear `preview/` by hand
 * occasionally.
 */
export function blobPrefix(): string {
	switch (env.VERCEL_ENV) {
		case 'production':
			return '';
		case 'preview':
			return 'preview/';
		default:
			// Local development, and anything unrecognised. Unrecognised lands
			// here rather than in production's namespace on purpose: the safe
			// failure is to be isolated, not to be live.
			return 'dev/';
	}
}
