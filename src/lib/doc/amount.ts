/**
 * What a shopping list is already carrying: a count at the front of a task and
 * a price at the back.
 *
 * Nothing here is stored. A task is one string and stays one string — this
 * reads it on the way to the screen, the way `langOf` does, so the markdown
 * export and what a screen reader hears keep exactly what was typed.
 *
 * Both `,` and `.` are decimal separators, because both are written. Thousands
 * are told apart by the digit pattern rather than by the character: a separator
 * with one or two digits after it is a decimal point, one with exactly three is
 * a grouping mark. That is the whole rule, and it is why `5,08` and `5.08` are
 * the same price while `1,234` and `1.234` are the same count of things.
 */

import type { Task } from './types';

export type Currency = '€' | '$' | '£';

export type Money = {
	/** Integer minor units, so a sum never drifts. */
	cents: number;
	/** Which mark was written for the decimal point, if one was. */
	separator: ',' | '.' | null;
	/** How many decimal places were written: 0, 1 or 2. */
	decimals: number;
	currency: Currency | null;
};

export type Reading = {
	/** The leading count, exactly as typed — `2x`, `3`, `1.5x` — or nothing. */
	amount: string | null;
	/** What is left in the middle. Never empty: it is the task. */
	name: string;
	/** The trailing price, exactly as typed — `5,08`, `€1.20` — or nothing. */
	cost: string | null;
	/** The same price as a number, or null when there is no price. */
	money: Money | null;
};

/**
 * A number, optionally followed by `x`, and then whitespace — so `2x TOMATOS`
 * and `3 POTATOS` both lead with a count and `2xTOMATOS` does not.
 */
const AMOUNT = /^(\d+(?:[.,]\d+)?(?:\s?[x×])?)(?=\s)/;

/**
 * A price sits at the end, behind a space, with at most one currency mark on
 * one side of it. The space is what guarantees a name is left over.
 */
const COST = /\s([€$£]?)(\d[\d.,]*)([€$£]?)$/;

const DIGITS = /^\d+(?:[.,]\d+)*$/;

/** Longer than this is not a price anyone wrote, and past what a float holds. */
const MAX_DIGITS = 12;

type Figure = { cents: number; separator: ',' | '.' | null; decimals: number };

function readNumber(raw: string): Figure | null {
	if (!DIGITS.test(raw)) return null;

	const seps = [...raw].filter((c): c is ',' | '.' => c === ',' || c === '.');
	const parts = raw.split(/[.,]/);

	if (seps.length === 0) {
		if (parts[0].length > MAX_DIGITS) return null;
		return { cents: Number(parts[0]) * 100, separator: null, decimals: 0 };
	}

	const last = parts[parts.length - 1];

	// One or two digits behind the final mark makes it a decimal point; exactly
	// three makes it another grouping mark. Four is neither, and not a price.
	const decimal = last.length <= 2;
	if (!decimal && last.length !== 3) return null;

	// Whatever is not the decimal point groups thousands, so it has to be one
	// mark used throughout, it cannot be the mark used for the decimal point,
	// and the runs it cuts have to be a lead of one to three and then threes.
	const grouping = decimal ? seps.slice(0, -1) : seps;
	const groups = decimal ? parts.slice(0, -1) : parts;

	if (grouping.length > 0) {
		if (grouping.some((mark) => mark !== grouping[0])) return null;
		if (decimal && grouping[0] === seps[seps.length - 1]) return null;
		if (groups[0].length > 3) return null;
		if (groups.slice(1).some((group) => group.length !== 3)) return null;
	}

	const digits = groups.join('');
	if (digits.length > MAX_DIGITS) return null;

	const places = decimal ? last : '';

	return {
		cents: Number(digits) * 100 + Number(places.padEnd(2, '0')),
		separator: decimal ? seps[seps.length - 1] : null,
		decimals: places.length
	};
}

export function amountsIn(text: string): Reading {
	const lead = AMOUNT.exec(text);
	const amount = lead ? lead[1] : null;
	const rest = lead ? text.slice(lead[0].length) : text;

	const tail = COST.exec(rest);
	const name = tail ? rest.slice(0, tail.index).trim() : rest.trim();

	// A task that is only a price is a name, not a price. So is one carrying a
	// currency mark on both sides of the number.
	if (tail && name !== '' && !(tail[1] !== '' && tail[3] !== '')) {
		const figure = readNumber(tail[2]);
		if (figure) {
			const mark = tail[1] || tail[3];
			return {
				amount,
				name,
				cost: tail[0].trim(),
				money: { ...figure, currency: mark === '' ? null : (mark as Currency) }
			};
		}
	}

	return { amount, name: rest.trim(), cost: null, money: null };
}

/**
 * What the rest of the list comes to.
 *
 * The separator follows the rows — whichever mark they wrote most, with a tie
 * or a silence going to the dot. Decimals appear only if a counted price had
 * them. A currency mark carries only when every row that wrote one wrote the
 * same one; rows that wrote none do not stop it.
 */
export function total(costs: readonly Money[]): Money | null {
	if (costs.length === 0) return null;

	let commas = 0;
	let dots = 0;
	const symbols = new Set<Currency>();

	for (const cost of costs) {
		if (cost.separator === ',') commas++;
		else if (cost.separator === '.') dots++;
		if (cost.currency !== null) symbols.add(cost.currency);
	}

	return {
		cents: costs.reduce((sum, cost) => sum + cost.cents, 0),
		separator: commas > dots ? ',' : '.',
		decimals: costs.every((cost) => cost.decimals === 0) ? 0 : 2,
		currency: symbols.size === 1 ? [...symbols][0] : null
	};
}

/**
 * Written out. Ungrouped, deliberately: which mark groups a thousand is a
 * second guess on top of the first, and a list this size rarely gets there.
 */
export function format(money: Money): string {
	const whole = Math.trunc(money.cents / 100);
	const places = money.cents % 100;

	const digits =
		money.decimals === 0
			? String(whole)
			: `${whole}${money.separator ?? '.'}${String(places).padStart(2, '0')}`;

	return money.currency === null ? digits : `${digits}${money.currency}`;
}

/**
 * A group's total, or nothing when there is nothing to total.
 *
 * Done does not count — it is bought, it is not money still to spend. Half
 * counts in full: half a task is one still on the list.
 */
export function groupTotal(tasks: readonly Pick<Task, 'text' | 'state'>[]): string | null {
	const counted: Money[] = [];

	for (const task of tasks) {
		if (task.state === 'done') continue;
		const { money } = amountsIn(task.text);
		if (money) counted.push(money);
	}

	const sum = total(counted);
	return sum === null ? null : format(sum);
}

/**
 * Whether any task in the group leads with a count. When one does, every row in
 * the group keeps the space for one, so the names line up down the sheet
 * whether or not a given row has a number in front of it.
 */
export function hasAmounts(tasks: readonly Pick<Task, 'text'>[]): boolean {
	return tasks.some((task) => amountsIn(task.text).amount !== null);
}
