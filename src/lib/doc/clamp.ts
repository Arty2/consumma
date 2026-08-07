import type { Doc, Stamp } from './types';

/** One device with a wrong clock should not win every merge forever. */
export const SKEW_MS = 60_000;

/**
 * Clamps every stamp in an incoming remote document to `now + SKEW_MS`.
 *
 * Applied by the sync layer before merging, never inside merge, which must
 * stay pure. Clamped values are then persisted and pushed, so the skew heals
 * rather than being re-clamped on every sync forever.
 */
export function clampStamps(doc: Doc, now: number, skew = SKEW_MS): Doc {
	const ceiling = now + skew;
	const clamp = (s: Stamp): Stamp => (s.t > ceiling ? { t: ceiling, c: s.c } : s);

	return {
		v: 1,
		groups: Object.fromEntries(
			Object.entries(doc.groups).map(([id, group]) => [
				id,
				{
					...group,
					stamps: {
						title: clamp(group.stamps.title),
						order: clamp(group.stamps.order),
						deleted: clamp(group.stamps.deleted)
					}
				}
			])
		),
		tasks: Object.fromEntries(
			Object.entries(doc.tasks).map(([id, task]) => [
				id,
				{
					...task,
					stamps: {
						text: clamp(task.stamps.text),
						state: clamp(task.stamps.state),
						order: clamp(task.stamps.order),
						groupId: clamp(task.stamps.groupId),
						deleted: clamp(task.stamps.deleted)
					}
				}
			])
		)
	};
}
