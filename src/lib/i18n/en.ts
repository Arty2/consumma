/*
 * Every word the app says, in one place.
 *
 * Not a framework and not a runtime: this is one object of English, and `t` in
 * ./index.ts is a reference to it. There is no locale to select, no negotiation
 * with the browser, and nothing shipped to switch between catalogues — a second
 * language is a second file and a resolver written the day there is something to
 * put in it. Until then the indirection buys the two things that were actually
 * missing: every string can be read in one sitting, and none of them can be
 * changed in one component and left stale in another.
 *
 * Values are strings, or functions of a typed argument where a number or a name
 * has to go inside the sentence. A function rather than a template with holes
 * punched in it, because plural agreement is part of the sentence and not a
 * decoration on top of it — English needs the count to pick the words, and a
 * language with more forms than two needs it to pick more of them. `plural`
 * below is English's rule and English's alone; another catalogue brings its own.
 *
 * What is NOT here: anything the person typed. A task, a group title, a list
 * name and a code are content, and content is never translated — see
 * `doc.firstGroup`, which is the one place the two meet and is commented there.
 */

/** English has two forms and the boundary is one. Another language, another rule. */
function plural(count: number, one: string, many: string): string {
	return count === 1 ? one : many;
}

export const en = {
	/*
	 * Two strings that are written into the document rather than only drawn on
	 * the screen, which makes them the exception to everything above.
	 *
	 * `firstGroup` becomes a real group title the moment anything is written on
	 * a fresh sheet, and that title syncs, exports and merges like any other. So
	 * a phone in another language would put its own word on somebody else's
	 * list. That is the correct behaviour for a default — it is a name the
	 * person is free to change, not a label the app is insisting on — but it is
	 * worth knowing before a second catalogue exists.
	 *
	 * `looseEnds` never syncs: it is assembled on read and is only ever an
	 * accessible name. See src/lib/doc/view.ts.
	 */
	doc: {
		firstGroup: 'My list',
		looseEnds: 'Loose ends'
	},

	task: {
		/** The row's own delete, offered only once the task is done. */
		delete: 'Delete task',
		new: 'New task',
		add: 'Add a task'
	},

	group: {
		new: 'New group',
		add: 'Add a group',
		title: 'Group title',
		untitled: 'Untitled group',
		/*
		 * The same fact in the middle of a sentence rather than as a name, so it
		 * is lower case and reads as a phrase: "Removed the untitled group."
		 * Two strings and not one, because a language that inflects would need
		 * two anyway and English only looks as though it does not.
		 */
		untitledInSentence: 'the untitled group',
		expand: 'Expand group',
		collapse: 'Collapse group',
		/*
		 * Two of each: the accessible name says what the button is for, and the
		 * tooltip says why it is not available. A disabled control that says only
		 * "Delete group" leaves the reason to be guessed at.
		 */
		delete: 'Delete group',
		deleteBlocked: 'Delete group — finish its tasks first',
		deleteBlockedHint: 'Finish its tasks first'
	},

	sheet: {
		/** Over the hundred: what is there, against what fits. */
		over: ({ count, max }: { count: number; max: number }) => `${count} of ${max} — clear some`,
		movedToNewGroup: 'Moved to a new group.',
		movedWithin: ({ position, group }: { position: number; group: string }) =>
			`Moved to position ${position} in ${group}.`,
		movedTo: ({ group, position }: { group: string; position: number }) =>
			`Moved to ${group}, position ${position}.`
	},

	toast: {
		deleted: 'Deleted.',
		removed: ({ what }: { what: string }) => `Removed ${what}.`,
		/** A removed group says how many finished tasks went with it. */
		removedWithDone: ({ what, count }: { what: string; count: number }) =>
			`${what} and ${count} done`,
		cleared: ({ count }: { count: number }) => `Cleared ${count}.`,
		copied: ({ count }: { count: number }) => `Copied ${count} ${plural(count, 'task', 'tasks')}.`,
		nothingToCopy: 'Nothing to copy yet.',
		couldNotCopy: 'Couldn’t copy.',
		added: ({ count }: { count: number }) => `Added ${count}.`,
		addedSkipped: ({ count, skipped }: { count: number; skipped: number }) =>
			`Added ${count}, skipped ${skipped} already there.`,
		left: 'Left this device.',
		synced: 'Synced.',
		undo: 'UNDO?',
		/*
		 * Written from LIMITS rather than typed out, which two of these used not
		 * to be: the sheet interpolated the number and the page spelled it, so
		 * raising a limit moved one message and left the other lying.
		 */
		overTasks: ({ max }: { max: number }) => `That would go over ${max} tasks — clear some first.`,
		overGroups: ({ max }: { max: number }) => `That would go over ${max} groups.`
	},

	menu: {
		label: 'Menu',
		close: 'Close',
		syncing: 'Syncing…',
		syncNow: 'Sync now',
		syncCooling: ({ seconds }: { seconds: number }) => `Sync now (${seconds})`,
		thisList: 'This list',
		share: 'Share',
		copy: 'Copy',
		copied: 'Copied',
		codeIsShared: 'Anyone with this code can read and change the list.',
		neverSynced: 'Only on this device. Sync it to get a code you can share.',
		import: 'Import',
		export: 'Export',
		clear: 'Clear',
		leave: 'Leave',
		joinList: 'Join list',
		code: 'Code',
		badCode: 'That doesn’t look like a code.',
		takeThem: 'Take them',
		leaveThem: 'Leave them',
		cancel: 'Cancel',
		join: 'Join',
		/** Joining with tasks already here is never decided silently. */
		joinAsk: ({ count }: { count: number }) =>
			`You have ${count} ${plural(count, 'task', 'tasks')} here. Take them to the other list, or leave them behind?`,
		/*
		 * "Debug" and not "Debug log": it now also outlines every box on the
		 * page, and a button that does two things cannot be named after one.
		 */
		debug: ({ on }: { on: boolean }) => `Debug: ${on ? 'On' : 'Off'}`,
		debugLog: 'Debug log',
		credit: 'Dialectic Acheropoieton',
		creditOf: 'of Heracles Papatheodorou and Claude',
		creditHome: 'heracl.es/consumma'
	},

	lists: {
		label: 'Lists',
		switch: 'Switch list',
		new: 'New list',
		/** A list that has never left this device has no code to show. */
		localOnly: 'Local only, never synced'
	},

	theme: {
		dark: 'Theme — dark',
		light: 'Theme — light',
		system: 'Theme — following the phone',
		/*
		 * Three sentences rather than one with the choice interpolated into it.
		 * The old form put a raw enum value inside English — `Theme now dark.` —
		 * which reads only by luck and would not survive a translation at all.
		 */
		nowDark: 'Theme now dark.',
		nowLight: 'Theme now light.',
		nowSystem: 'Theme now follows the phone.'
	},

	sync: {
		nothingWaiting: 'Nothing is waiting to go.',
		everythingSynced: 'Everything is synced.',
		waiting: ({ count }: { count: number }) =>
			count === 1 ? '1 change is waiting to go.' : `${count} changes are waiting to go.`,
		/** Agrees with the count above it. One change is an "it". */
		unseen: ({ count }: { count: number }) =>
			count === 1
				? 'Nobody else can see it until you sync.'
				: 'Nobody else can see them until you sync.',
		refused: 'The list’s own server turned the last attempt away.',
		unreachable: 'The list could not be reached last time. Everything is safe on this device.',

		/** The corner button's accessible name, which is the whole of what it says. */
		buttonOffline: 'Sync — no connection last time',
		buttonStale: 'Sync — not synced for a while',
		buttonWaiting: ({ count }: { count: number }) =>
			count === 1 ? 'Sync — 1 change waiting to go' : `Sync — ${count} changes waiting to go`,

		/** What went wrong, when something did. */
		errorOffline: 'Couldn’t reach the list — your changes are saved here.',
		/*
		 * Naming the code is the point: it is the only thing that says whether
		 * the route is missing or its store is.
		 */
		errorRefused: ({ code }: { code: number }) =>
			`The list’s server answered ${code}. Nothing here was lost.`,
		errorWrongCode: 'That code doesn’t match a list.',
		errorDamaged: 'That list looks damaged.',
		errorTooLarge: 'This list is too big to send — clear some.',
		errorBusy: 'Couldn’t sync — try again in a moment.',
		errorOther: ({ message }: { message: string }) => `Something went wrong: ${message}`
	},

	import: {
		title: 'Import',
		field: 'Markdown to import',
		preview: 'What will be added',
		empty: 'Paste a list — one thing per line, or a markdown checklist.',
		fromClipboard: 'From your clipboard. Edit it here if anything is off.',
		/*
		 * Why it was turned away, when it was. A data file and a web page both
		 * come out of a line-by-line read as a heap of punctuation, so they are
		 * refused rather than imported — and saying which it was is the
		 * difference between a rule and a shrug.
		 */
		refusedJson: 'That looks like a data file, not a list.',
		refusedHtml: 'That looks like a web page, not a list.',
		refusedOther: 'That doesn’t look like a task list.',
		summary: ({ tasks, groups }: { tasks: number; groups: number }) =>
			`Add ${tasks} ${plural(tasks, 'task', 'tasks')} in ${groups} ${plural(groups, 'group', 'groups')}?`,
		replaceAll: 'Replace All',
		add: 'Add'
	},

	confirm: {
		cancel: 'Cancel',
		clearTitle: 'Clear completed tasks',
		clearConfirm: 'Clear',
		clearBody: ({ count }: { count: number }) =>
			`Remove ${count} completed ${plural(count, 'task', 'tasks')}? They go for everyone on this list, the next time you sync.`,
		leaveTitle: 'Leave this list',
		leaveConfirm: 'Leave',
		leaveBody: ({ code }: { code: string }) =>
			`This leaves the list off this phone. Everyone else keeps it. To come back you'll need the code — ${code}. This is the last screen it exists on.`,
		leaveUnsent: ({ count }: { count: number }) =>
			`You have ${count} ${plural(count, 'change', 'changes')} that never reached anyone else; those go too.`,
		/*
		 * Never synced, so there is no code to write down and nobody else
		 * holding a copy. Offering one last look at a code would be offering
		 * nothing.
		 */
		leaveBodyNoCode:
			'This list has never been synced, so it is nowhere but here. Leaving takes all of it with it, and there is no code to come back with.'
	}
} as const;
