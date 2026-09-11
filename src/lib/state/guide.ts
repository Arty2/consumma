/*
 * What an invitation's link says, and how far the guidance over it has got.
 *
 * The code is not in here and never will be: an invitation is two lines, the
 * link and the code, and the code travels in the message rather than in the
 * URL — not as a query, not as a fragment. What the link carries is one
 * character saying "somebody sent you a list", which is a fact about the
 * person arriving rather than about the list they are arriving at. It can be
 * read by anyone who sees the message, and there is nothing in it to read.
 *
 * Pure, and separate from the state that holds it (guide.svelte.ts), the way
 * lists.ts is separate from lists.svelte.ts: the question "does this search
 * string mean an invitation" and the question "what does the guide do next"
 * are both answerable at a desk, and both are tested.
 */

/**
 * The flag on the link. One letter, because it is read by nobody and typed by
 * nobody — it rides on the end of a link somebody pastes into a message, and
 * the shorter it is the less of the link looks like machinery.
 *
 * `?j` and not `?join=1`: there is no value to carry. The flag is present or
 * it is not.
 */
export const INVITE = 'j';

/**
 * Where the guidance is pointing, or nowhere.
 *
 * Two marks and no more, because there are exactly two things between arriving
 * and being on the list: the menu is behind the burger, and the code goes in
 * the field under JOIN LIST. A third step explaining the JOIN button under it
 * would be explaining a button that says what it does.
 */
export type Step = 'burger' | 'code' | null;

/**
 * What happened, as far as the guide is concerned. Everything here is
 * something the person did; nothing is a timer.
 */
export type Turn =
	/** The menu opened, so the burger has been found. */
	| 'opened'
	/** The menu closed without a code going in. */
	| 'closed'
	/** Something that looks like a code reached the field. */
	| 'coded'
	/** Put away by hand — Escape, on either face. */
	| 'dropped';

/**
 * Whether this is somebody arriving on an invitation.
 *
 * Read off the query and nothing else. A flag with a value, `?j=`, counts too:
 * what is being asked is whether the parameter is there.
 */
export function invited(search: string): boolean {
	return new URLSearchParams(search).has(INVITE);
}

/**
 * The whole of the guide's memory.
 *
 * A guide that is off stays off: nothing here can start it, so an app somebody
 * has been using for a month cannot suddenly draw arrows across itself because
 * a menu opened. Starting is the flag's job and the flag's alone.
 *
 * Closing the menu goes back to the burger rather than giving up. Somebody who
 * opened the panel, did not find the field and turned the paper back over is
 * the person this is for, and a guide that spent itself on one look would be
 * gone exactly when it is wanted.
 */
export function next(step: Step, turn: Turn): Step {
	if (step === null) return null;

	switch (turn) {
		case 'opened':
			return 'code';
		case 'closed':
			return 'burger';
		case 'coded':
		case 'dropped':
			return null;
	}
}
