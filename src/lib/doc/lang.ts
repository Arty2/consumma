/*
 * Which language an element showing this text should declare.
 *
 * This exists for one reason. The sheet is set in caps through
 * `text-transform: uppercase`, and uppercasing Greek is language-dependent:
 * Greek drops the tonos when it goes to capitals — ΚΑΦΕΣ, not ΚΑΦΈΣ — and a
 * browser only applies that rule when it has been told the text is Greek.
 *
 * Left as English the result is not merely unidiomatic, it is broken: Chrome
 * renders μαΐστρος as ΜΑΪ́ΣΤΡΟΣ, dialytika plus a stranded combining acute.
 * With the language declared it gives ΜΑΪΣΤΡΟΣ.
 *
 * Doing the transform ourselves is not an option and never should be: the
 * uppercase is CSS only, so that what is stored, exported and read aloud keeps
 * the casing the person typed. Declaring the language is how that rule and
 * correct Greek coexist.
 */

/**
 * Any Greek letter, monotonic or polytonic. `Script=Greek` covers the Greek
 * and Greek Extended blocks while excluding Coptic, which shares a block but
 * not the casing rule.
 */
const GREEK = /\p{Script=Greek}/u;

/**
 * The `lang` for an element showing `text`, or `undefined` to inherit the
 * page's. Svelte omits an attribute that is `undefined`, so this binds
 * directly: `lang={langOf(task.text)}`.
 *
 * One Greek letter is enough to call the whole string Greek. That is
 * deliberate, and the asymmetry is the point: the casing rule only touches
 * Greek letters, so declaring Greek on "Bread ψωμί" fixes the Greek word and
 * leaves the English one alone, whereas a proportion test would leave the
 * Greek word visibly miscased. The cost is that a lone Greek letter in an
 * English sentence — "Calculate π area" — marks that sentence Greek for a
 * screen reader. Nothing is miscased either way, so the milder failure wins.
 */
export function langOf(text: string): 'el' | undefined {
	return GREEK.test(text) ? 'el' : undefined;
}
