<script lang="ts">
	import AddRow from './AddRow.svelte';
	import GroupHeader from './GroupHeader.svelte';
	import TaskRow from './TaskRow.svelte';
	import TextRule from './TextRule.svelte';
	import { langOf } from '$lib/doc/lang';
	import { LIMITS } from '$lib/doc/limits';
	import type { State } from '$lib/doc/types';
	import { handLine } from '$lib/draw/hand';
	import { seedFrom } from '$lib/draw/rng';
	import { drag, type DropTarget } from '$lib/dnd/drag.svelte';
	import { sheet } from '$lib/state/doc.svelte';
	import { ui } from '$lib/state/ui.svelte';

	let newGroupOpen = $state(false);
	let newGroupDraft = $state('');
	let landingWidth = $state(0);

	const overLimit = $derived(sheet.taskCount > LIMITS.tasks);

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
		const group = sheet.groups.find((g) => g.id === id);
		const count = group?.tasks.length ?? 0;

		sheet.deleteGroup(id);
		ui.say(count === 0 ? `Removed ${label(title)}.` : `Removed ${label(title)} and ${count} done.`);
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
				collapsed={ui.isCollapsed(group.id)}
				count={group.tasks.length}
				finished={group.tasks.every((task) => task.state === 'done')}
				editable={!group.synthetic}
				ontoggle={() => ui.toggleCollapsed(group.id)}
				onrename={(title) => sheet.renameGroup(group.id, title)}
				ondelete={() => removeGroup(group.id, group.title)}
				onreorder={(index) => sheet.moveGroup(group.id, sheet.groupOrderAt(index, group.id))}
			/>

			{#if !ui.isCollapsed(group.id)}
				<ul class="tasks">
					{#each group.tasks as task, taskIndex (task.id)}
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

					{#if !group.synthetic}
						<AddRow
							seed={group.id}
							disabled={!sheet.canAddTask}
							onadd={(text) => sheet.addTask(group.id, text) !== null}
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
