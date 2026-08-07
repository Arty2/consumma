import { liveGroups, liveTasks } from '$lib/doc/ops';
import type { Doc, State } from '$lib/doc/types';

/**
 * The list as a markdown checklist. Groups are `##` headings.
 *
 * This doubles as the only backup the app has, which is worth remembering
 * given that losing the code loses the list.
 */

export const MARKERS: Record<State, string> = {
	todo: '[ ]',
	half: '[~]',
	done: '[x]'
};

export function toMarkdown(doc: Doc): string {
	const lines: string[] = [];
	const groups = liveGroups(doc);

	for (const group of groups) {
		// A group with no title is written before the first heading, which is
		// exactly where import puts items it finds there.
		if (group.title !== '') {
			if (lines.length > 0) lines.push('');
			// Original casing, not the uppercase the UI displays.
			lines.push(`## ${group.title}`, '');
		}

		for (const task of liveTasks(doc, group.id)) {
			lines.push(`- ${MARKERS[task.state]} ${task.text}`);
		}
	}

	return lines.length === 0 ? '' : `${lines.join('\n')}\n`;
}

export function countTasks(doc: Doc): number {
	return liveTasks(doc).length;
}
