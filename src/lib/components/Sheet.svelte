<script lang="ts">
	import AddRow from './AddRow.svelte';
	import GroupHeader from './GroupHeader.svelte';
	import TaskRow from './TaskRow.svelte';
	import TextRule from './TextRule.svelte';
	import { langOf } from '$lib/doc/lang';
	import { LIMITS } from '$lib/doc/limits';
	import type { State } from '$lib/doc/types';
	import type { ViewGroup } from '$lib/doc/view';
	import { handLine } from '$lib/draw/hand';
	import { seedFrom } from '$lib/draw/rng';
	import { drag, type DropTarget } from '$lib/dnd/drag.svelte';
	import { sheet } from '$lib/state/doc.svelte';
	import { ui } from '$lib/state/ui.svelte';

	let newGroupOpen = $state(false);
	let newGroupDraft = $state('');
	let landingWidth = $state(0);

	/**
	 * Where an open, empty task row is sitting, if anywhere.
	 *
	 * Enter on a task puts one directly beneath it; Enter on a group title puts
	 * one at the top of the group. There is never more than one, because there
	 * is only one caret.
	 */
	let inserting = $state<{ groupId: string; index: number } | null>(null);

	const overLimit = $derived(sheet.taskCount > LIMITS.tasks);

	/*
	 * A sheet with nothing written on it yet, where the add row is the only row
	 * there is. Its empty box is shown rather than kept back then — there is no
	 * list for it to sit at the end of and be counted as part of, and it is the
	 * one thing on an empty sheet saying what a task here looks like.
	 *
	 * Both halves are needed. Loose ends is assembled from tasks, so with none
	 * there is exactly one group and exactly one add row; two empty groups would
	 * put up two of these, which is a list of nothing rather than an invitation.
	 */
	const lone = $derived(sheet.taskCount === 0 && sheet.groups.length === 1);

	/*
	 * Everything folds shut while a group is being carried, so the whole list is
	 * a handful of titles and there is somewhere visible to put it down. Nothing
	 * is written: this is a view of the drag, not a change to what is collapsed.
	 */
	const folded = $derived(drag.groupId !== null);

	/** The placeholder is a title one step earlier, so its rule follows it. */
	const newGroupShown = $derived(newGroupOpen ? newGroupDraft : '…');
	const landing = $derived(
		landingWidth > 0 ? handLine(landingWidth, { seed: seedFrom('landing'), wobble: 1.2, y: 2 }) : ''
	);

	function setState(id: string, state: State) {
		sheet.setState(id, state);
		ui.celebrate(sheet.finished);
	}

	/*
	 * Only offered once every task in the group is done, so nothing anyone is
	 * still waiting on goes with it — but the tasks do go, so it says how many.
	 */
	function removeGroup(id: string, title: string) {
		const gone = sheet.deleteGroup(id);
		if (!gone) return;

		const count = gone.tasks.length;
		const what = count === 0 ? label(title) : `${label(title)} and ${count} done`;

		// The confirm stops nothing here — the header only offers it on a finished
		// group — so the undo is what covers a change of mind.
		ui.say(`Removed ${what}.`, () => {
			sheet.restoreGroup(gone);
			ui.dismiss();
		});
	}

	/**
	 * The group id a new task is stored under.
	 *
	 * Loose ends has none of its own: `LOOSE_ENDS_ID` is a view constant, and
	 * `ID_PATTERN` refuses it, so storing a task under it would fail validation
	 * on the next read and take the whole document down with it. What the tasks
	 * already under that heading point at is a real id — the group they lost —
	 * and a new one joins them there rather than inventing a second nowhere.
	 */
	function groupIdFor(group: ViewGroup): string | null {
		if (!group.synthetic) return group.id;
		return group.tasks[0]?.groupId ?? null;
	}

	/** The add row at the end of a group, Loose ends included. */
	function add(group: ViewGroup, text: string): boolean {
		const groupId = groupIdFor(group);
		if (groupId === null) return false;

		return group.synthetic
			? sheet.addTaskAfter(groupId, text, group.tasks.at(-1)?.order ?? null) !== null
			: sheet.addTask(groupId, text) !== null;
	}

	/**
	 * Puts a task in at a position rather than on the end, and moves the open
	 * row down past it so a run of Enters reads top to bottom.
	 */
	function insert(group: ViewGroup, index: number, text: string): boolean {
		const groupId = groupIdFor(group);
		if (groupId === null) return false;

		/*
		 * Within Loose ends an index means nothing — see addTaskAfter — so it
		 * goes after the task it was opened beneath.
		 */
		const id = group.synthetic
			? sheet.addTaskAfter(groupId, text, group.tasks[index - 1]?.order ?? null)
			: sheet.addTaskAt(groupId, index, text);
		if (id === null) return false;

		inserting = { groupId: group.id, index: index + 1 };
		return true;
	}

	function remove(id: string) {
		const entry = sheet.deleteTask(id);
		if (!entry) return;

		ui.say('Deleted.', () => {
			sheet.restore([entry]);
			ui.dismiss();
		});
	}

	/** Where a drag let go. The neighbours are never restamped. */
	function drop(taskId: string, target: DropTarget) {
		// Loose ends is assembled on read and cannot hold a task.
		if (sheet.groups.find((g) => g.id === target.groupId)?.synthetic) return;

		sheet.moveTask(taskId, target.groupId, sheet.orderAt(target.groupId, target.index, taskId));
	}

	/**
	 * Alt+↑ / Alt+↓, crossing group boundaries at the ends — the path that has
	 * to keep working without a finger.
	 */
	function move(groupIndex: number, taskIndex: number, direction: -1 | 1) {
		const group = sheet.groups[groupIndex];
		const task = group.tasks[taskIndex];
		if (!task) return;

		const target = taskIndex + direction;

		if (target >= 0 && target < group.tasks.length) {
			sheet.moveTask(task.id, group.id, sheet.orderAt(group.id, target, task.id));
			ui.announce(`Moved to position ${target + 1} in ${label(group.title)}.`);
			return;
		}

		// Off the end: step into the neighbouring group, skipping Loose ends,
		// which is assembled on read and cannot hold a task.
		const next = sheet.groups[groupIndex + direction];
		if (!next || next.synthetic) return;

		const position = direction === 1 ? 0 : next.tasks.length;
		sheet.moveTask(task.id, next.id, sheet.orderAt(next.id, position, task.id));
		ui.expand(next.id);
		ui.announce(`Moved to ${label(next.title)}, position ${position + 1}.`);
	}

	function label(title: string) {
		return title === '' ? 'the untitled group' : title;
	}

	function addGroup() {
		const title = newGroupDraft.trim();
		newGroupDraft = '';
		newGroupOpen = false;
		if (title !== '') sheet.addGroup(title);
	}

	function onNewGroupKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			(event.currentTarget as HTMLInputElement).blur();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			newGroupDraft = '';
			newGroupOpen = false;
		}
	}
</script>

<!-- Measures the width the landing rule is drawn at. -->
<svg class="measure" bind:clientWidth={landingWidth} aria-hidden="true"></svg>

<div class="sheet">
	{#each sheet.groups as group, groupIndex (group.id)}
		{#if drag.isGroupLanding(groupIndex)}
			<div class="landing" aria-hidden="true">
				<svg viewBox="0 0 {landingWidth} 5" width={landingWidth} height="5">
					<path d={landing} class="drawn drawn--dashed" />
				</svg>
			</div>
		{/if}

		<section class="group" data-group={group.id}>
			<!-- Every group gets a header, so one with no title is still nameable. -->
			<GroupHeader
				title={group.title}
				seed={group.id}
				collapsed={folded || ui.isCollapsed(group.id)}
				count={group.tasks.length}
				finished={group.tasks.every((task) => task.state === 'done')}
				synthetic={group.synthetic}
				ontoggle={() => ui.toggleCollapsed(group.id)}
				onrename={(title) => sheet.renameGroup(group.id, title)}
				ondelete={() => removeGroup(group.id, group.title)}
				onaddtask={() => (inserting = { groupId: group.id, index: 0 })}
				onreorder={(index) => sheet.moveGroup(group.id, sheet.groupOrderAt(index, group.id))}
			/>

			{#if !folded && !ui.isCollapsed(group.id)}
				<ul class="tasks">
					{#each group.tasks as task, taskIndex (task.id)}
						{#if inserting?.groupId === group.id && inserting.index === taskIndex}
							<AddRow
								seed={`${group.id}-at${taskIndex}`}
								disabled={!sheet.canAddTask}
								opened
								onadd={(text) => insert(group, taskIndex, text)}
								onclose={() => (inserting = null)}
							/>
						{/if}

						{#if drag.isLanding(group.id, taskIndex)}
							<li class="landing" aria-hidden="true">
								<svg viewBox="0 0 {landingWidth} 5" width={landingWidth} height="5">
									<path d={landing} class="drawn drawn--dashed" />
								</svg>
							</li>
						{/if}

						<TaskRow
							{task}
							groupId={group.id}
							onstate={(state) => setState(task.id, state)}
							onedit={(text) => sheet.editTask(task.id, text)}
							ondelete={() => remove(task.id)}
							onsplit={() => (inserting = { groupId: group.id, index: taskIndex + 1 })}
							onmove={(direction) => move(groupIndex, taskIndex, direction)}
							ondrop={(target) => drop(task.id, target)}
							onEnterGroup={(id) => ui.expand(id)}
						/>
					{/each}

					{#if drag.isLanding(group.id, group.tasks.length)}
						<li class="landing" aria-hidden="true">
							<svg viewBox="0 0 {landingWidth} 5" width={landingWidth} height="5">
								<path d={landing} class="drawn drawn--dashed" />
							</svg>
						</li>
					{/if}

					{#if inserting?.groupId === group.id && inserting.index === group.tasks.length}
						<AddRow
							seed={`${group.id}-end`}
							disabled={!sheet.canAddTask}
							opened
							onadd={(text) => insert(group, group.tasks.length, text)}
							onclose={() => (inserting = null)}
						/>
					{/if}

					<!--
						Every group ends with one, Loose ends included. It is assembled
						on read rather than stored, but it is still a heading with tasks
						under it and the last thing on the sheet — leaving it the only
						one with no way to add put a dead end at the bottom of the page,
						which is where a list is most likely to be added to.
					-->
					<AddRow
						seed={group.id}
						disabled={!sheet.canAddTask}
						{lone}
						onadd={(text) => add(group, text)}
					/>
				</ul>
			{/if}
		</section>
	{/each}

	{#if drag.isGroupLanding(sheet.groups.length)}
		<div class="landing" aria-hidden="true">
			<svg viewBox="0 0 {landingWidth} 5" width={landingWidth} height="5">
				<path d={landing} class="drawn drawn--dashed" />
			</svg>
		</div>
	{/if}

	{#if overLimit}
		<p class="over">{sheet.taskCount} of {LIMITS.tasks} — clear some</p>
	{/if}

	<!-- The same glyph in two type sizes: one more task, or one more group. -->
	<div class="new-group">
		{#if newGroupOpen}
			<!-- svelte-ignore a11y_autofocus -->
			<input
				class="caps"
				type="text"
				lang={langOf(newGroupDraft)}
				maxlength={LIMITS.groupTitle}
				aria-label="New group"
				autofocus
				bind:value={newGroupDraft}
				onblur={addGroup}
				onkeydown={onNewGroupKeydown}
			/>
		{:else}
			<button
				type="button"
				class="caps"
				disabled={!sheet.canAddGroup}
				aria-label="Add a group"
				onclick={() => (newGroupOpen = true)}
			>
				…
			</button>
		{/if}

		<TextRule text={newGroupShown} seed="new-group" faint />
	</div>
</div>

<p class="sr-only" role="status" aria-live="polite">{ui.announcement}</p>

<style>
	.measure {
		display: block;
		width: 100%;
		height: 0;
	}

	.sheet {
		padding: 0 0 2rem;
	}

	/*
	 * No gap between groups. Every group ends with the add row, and the empty
	 * line it holds is already the space before the next title — a margin on top
	 * of it left a hole big enough to read as a missing group.
	 */
	.group {
		margin-bottom: 0;
	}

	/*
	 * The title needs the same air under it that the tasks have between them,
	 * or it sits on the first one.
	 *
	 * Measured rather than picked: a 44px row around ~13px of capitals leaves
	 * 31.5px of white between one task's ink and the next, and the drawn rule
	 * ended 10.3px above the first. This is the difference. Retune it if the
	 * row height or the face changes — both feed the number.
	 */
	.tasks {
		margin: 1.3rem 0 0;
		padding: 0;
	}

	.landing {
		list-style: none;
		height: 5px;
		margin: 0;
		overflow: visible;
	}

	.over {
		margin: 0 0 1rem var(--touch);
		opacity: 0.7;
	}

	/* Flush with the real group titles: it is the same thing, one step earlier. */
	.new-group button,
	.new-group input {
		display: block;
		min-height: var(--touch);
		font-family: var(--hand);
		font-size: var(--size-title);
		text-align: left;
	}

	/* As faint as the rule under it: the two are one mark. */
	.new-group button {
		opacity: var(--faint);
	}

	.new-group input {
		outline: none;
		cursor: text;
	}

	.new-group button:disabled {
		opacity: 0.4;
		cursor: default;
	}
</style>
