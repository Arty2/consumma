import { env } from '$env/dynamic/private';
import type { RequestHandler } from '@sveltejs/kit';
import { vercelBlobs } from '$lib/server/blobs';
import { blobPrefix } from '$lib/server/env';
import { bearerMatches } from '$lib/server/secret';
import { RoomStore } from '$lib/server/store';

/*
 * A daily job that deletes any list nobody has written to in six months.
 *
 * That is the whole cleanup story: no TTL, no touch-on-read bookkeeping, no
 * per-request expiry logic. Note that *editing* keeps a list alive, not
 * reading — a list two people check but never change all summer will not
 * survive, which is why EXPORT exists and why the README says so plainly.
 */

export const prerender = false;

const store = new RoomStore(vercelBlobs, { prefix: blobPrefix() });

export const GET: RequestHandler = async ({ request }) => {
	// Guarded so it cannot be triggered from outside, and compared in constant
	// time so the secret cannot be recovered a byte at a time.
	if (!bearerMatches(request.headers.get('authorization'), env.CRON_SECRET)) {
		return new Response(null, { status: 401, headers: { 'Cache-Control': 'no-store' } });
	}

	const deleted = await store.sweep();

	// A count, and nothing identifying. Never the paths.
	return new Response(JSON.stringify({ deleted }), {
		headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
	});
};
