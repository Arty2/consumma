import { invited, next, type Step, type Turn } from './guide';

/**
 * The one time this app explains itself, and it is not about the app.
 *
 * Nothing on the sheet is labelled and nothing is going to be: no help screen,
 * no tooltips, no empty-state copy (§12.14). This is not a breach of that and
 * it is not a tour. Somebody has been handed a code in a message and has
 * tapped the link beside it; they are holding a key and standing in front of a
 * sheet of paper with nothing on it that says where the lock is. The guidance
 * says where, in red, over the app rather than in it, and it is gone the
 * moment the code lands.
 *
 * It is shown only to somebody who arrived on an invitation — the link's own
 * flag is the whole condition — and it is state about this reading of the app
 * rather than about the device: **nothing is written down**. Arriving writes
 * nothing, and that holds for arriving on an invitation too. A reload with the
 * flag gone is a person who is no longer newly arrived.
 */
class Guide {
	step = $state<Step>(null);

	/** Drawn at all, and so measured at all. */
	get showing(): boolean {
		return this.step !== null;
	}

	/**
	 * Starts it, if this is an invitation.
	 *
	 * Takes the query rather than reading `location` itself, so what decides is
	 * a string and the decision stays testable. The caller strips the flag off
	 * the address afterwards — see `+page.svelte`.
	 */
	start(search: string): void {
		if (invited(search)) this.step = 'burger';
	}

	/** Something happened that the guidance has an answer to. */
	saw(turn: Turn): void {
		this.step = next(this.step, turn);
	}
}

export const guide = new Guide();
