<script lang="ts">
	import AddRow from './AddRow.svelte';
	import GroupHeader from './GroupHeader.svelte';
	import TaskRow from './TaskRow.svelte';
	import TextRule from './TextRule.svelte';
	import { figures } from '$lib/doc/amount';
	import { langOf } from '$lib/doc/lang';
	import { LIMITS } from '$lib/doc/limits';
	import type { State } from '$lib/doc/types';
	import { handLine } from '$lib/draw/hand';
	import { seedFrom } from '$lib/draw/rng';
	import { drag, NEW_GROUP, type DropTarget } from '$lib/dnd/drag.svelte';
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

	/**
	 * Which task's editor to open, when the caret is coming back up from a row
	 * that was backspaced away. Cleared as soon as the row reports it opened, so
	 * the same row can be reached again the next time.
	 */
	let opening = $state<string | null>(null);

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
	 * Puts a task in at a position rather than on the end, and moves the open
	 * row down past it so a run of Enters reads top to bottom.
	 */
	function insert(groupId: string, index: number, text: string): boolean {
		const id = sheet.addTaskAt(groupId, index, text);
		if (id === null) return false;

		inserting = { groupId, index: index + 1 };
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

	/**
	 * Backspace on a row with nothing left in it: the row goes, and the caret
	 * carries on at the end of the task above.
	 *
	 * `index` is where the empty row sits, so the task above it is the one
	 * before. First in its group and there is nobody above — the row simply
	 * closes, and nothing is deleted.
	 */
	function back(groupId: string, index: number, taskId?: string) {
		const above = sheet.groups.find((group) => group.id === groupId)?.tasks[index - 1];

		// A task that exists only goes if there is somewhere for the caret to go.
		if (taskId) {
			if (!above) return;
			remove(taskId);
		}

		inserting = null;
		opening = above?.id ?? null;
	}

	/** Where a drag let go. The neighbours are never restamped. */
	function drop(taskId: string, target: DropTarget) {
		/*
		 * Let go on the row that offers a new group: the group is made on the
		 * spot and the task is its first. It arrives unnamed, showing the same
		 * ellipsis an untitled group always shows — carrying a task somewhere new
		 * is one decision, and being made to name it before the finger comes up
		 * would be a second.
		 */
		if (target.groupId === NEW_GROUP) {
			if (!sheet.canAddGroup) {
				ui.say(`That would go over ${LIMITS.groups} groups.`);
				return;
			}

			const id = sheet.addGroup('');
			if (id === null) return;

			sheet.moveTask(taskId, id, sheet.orderAt(id, 0, taskId));
			ui.announce('Moved to a new group.');
			return;
		}

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

{#snippet newGroup()}
	<!--
		Also where a carried task can be let go: `data-newgroup` is what the drag
		hit-tests for, and the dashed rule appears over it the way it does between
		two rows, so the offer is made in the same hand as every other landing.
	-->
	{#if drag.isLanding(NEW_GROUP, 0)}
		<div class="landing" aria-hidden="true">
			<svg viewBox="0 0 {landingWidth} 5" width={landingWidth} height="5">
				<path d={landing} class="drawn drawn--dashed" />
			</svg>
		</div>
	{/if}

	<!-- The same glyph in two type sizes: one more task, or one more group. -->
	<div class="new-group" data-newgroup>
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

		<!--
			Faint while it is still an offer, ink as soon as it is being written in.
			The ellipsis and its rule are one mark in two media and cannot be set
			apart — but a title being typed is no longer a placeholder, and a full
			rule under it is what every other title on the sheet gets.
		-->
		<TextRule text={newGroupShown} seed="new-group" faint={!newGroupOpen} />
	</div>
{/snippet}

<!-- Measures the width the landing rule is drawn at. -->
<svg class="measure" bind:clientWidth={landingWidth} aria-hidden="true"></svg>

<div class="sheet">
	<!--
		Loose ends is always last and is never something anyone made. The way to
		make one belongs above it, among the groups it would sit beside — under
		the line it would read as a way to name what is already there.
	-->
	{#each sheet.groups as group, groupIndex (group.id)}
		{#if group.synthetic}
			{@render newGroup()}
		{/if}

		{#if drag.isGroupLanding(groupIndex)}
			<div class="landing" aria-hidden="true">
				<svg viewBox="0 0 {landingWidth} 5" width={landingWidth} height="5">
					<path d={landing} class="drawn drawn--dashed" />
				</svg>
			</div>
		{/if}

		<!-- Read once for the whole group: the rows write their numbers its way. -->
		{@const fig = figures(group.tasks)}

		<section class="group" data-group={group.id}>
			<!-- Every group gets a header, so one with no title is still nameable. -->
			<GroupHeader
				title={group.title}
				seed={group.id}
				collapsed={folded || ui.isCollapsed(group.id)}
				count={group.tasks.length}
				finished={group.tasks.every((task) => task.state === 'done')}
				synthetic={group.synthetic}
				total={fig.total}
				ontoggle={() => ui.toggleCollapsed(group.id)}
				onrename={(title) => sheet.renameGroup(group.id, title)}
				ondelete={() => removeGroup(group.id, group.title)}
				onaddtask={() => (inserting = { groupId: group.id, index: 0 })}
				onreorder={(index) => sheet.moveGroup(group.id, sheet.groupOrderAt(index, group.id))}
			/>

			{#if !folded && !ui.isCollapsed(group.id)}
				<ul class="tasks">
					{#each group.tasks as task, taskIndex (task.id)}
						{#if !group.synthetic && inserting?.groupId === group.id && inserting.index === taskIndex}
							<AddRow
								seed={`${group.id}-at${taskIndex}`}
								disabled={!sheet.canAddTask}
								opened
								onadd={(text) => insert(group.id, taskIndex, text)}
								onclose={() => (inserting = null)}
								onback={() => back(group.id, taskIndex)}
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
							style={fig.style}
							open={opening === task.id}
							onstate={(state) => setState(task.id, state)}
							onedit={(text) => sheet.editTask(task.id, text)}
							ondelete={() => remove(task.id)}
							onsplit={() =>
								group.synthetic || (inserting = { groupId: group.id, index: taskIndex + 1 })}
							onback={() => back(group.id, taskIndex, task.id)}
							onopened={() => (opening = null)}
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

					{#if !group.synthetic && inserting?.groupId === group.id && inserting.index === group.tasks.length}
						<AddRow
							seed={`${group.id}-end`}
							disabled={!sheet.canAddTask}
							opened
							onadd={(text) => insert(group.id, group.tasks.length, text)}
							onclose={() => (inserting = null)}
							onback={() => back(group.id, group.tasks.length)}
						/>
					{/if}

					<!--
						Real groups only. Nothing under Loose ends was put there on
						purpose — it is where two phones disagreeing leaves a task — so
						offering to write a new one into it would be offering to file
						something under the fact that a group went missing.
					-->
					{#if !group.synthetic}
						<AddRow
							seed={group.id}
							disabled={!sheet.canAddTask}
							{lone}
							onadd={(text) => sheet.addTask(group.id, text) !== null}
							onback={() => back(group.id, group.tasks.length)}
						/>
					{/if}
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

	{#if !sheet.groups.some((group) => group.synthetic)}
		{@render newGroup()}
	{/if}

	{#if overLimit}
		<p class="over">{sheet.taskCount} of {LIMITS.tasks} — clear some</p>
	{/if}
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

	/*
	 * Drawn in the gap between two rows rather than opening one.
	 *
	 * It used to be five pixels tall and in the flow, so every time the target
	 * changed, every row past it moved five pixels — six of those in one slow
	 * drag down a list of five, which is what the jerking under the finger
	 * actually was. Worse, the rows it moved are the rows the next hit test
	 * reads, so the drag was steering by a ruler it kept nudging.
	 *
	 * Zero height and an overflowing stroke: the mark is in the same place it
	 * always was, and nothing below it knows the mark exists.
	 */
	.landing {
		list-style: none;
		height: 0;
		margin: 0;
		overflow: visible;
	}

	.landing svg {
		display: block;
		/*
		 * Half above the boundary and half below, so it straddles rather than
		 * sitting on the row beneath.
		 *
		 * `translate` rather than a negative margin: the margin collapsed
		 * straight through the empty row and moved the row itself, which put
		 * two or three pixels of the same jerk back after taking five away.
		 * A translate is paint only and nothing in the flow can feel it.
		 */
		translate: 0 -2.5px;
		/* Never a thing the drag can hit-test against, only a thing it draws. */
		pointer-events: none;
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
