<script lang="ts">
	import AddRow from './AddRow.svelte';
	import GroupHeader from './GroupHeader.svelte';
	import TaskRow from './TaskRow.svelte';
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
	const landing = $derived(
		landingWidth > 0 ? handLine(landingWidth, { seed: seedFrom('landing'), wobble: 1.2, y: 2 }) : ''
	);

	function setState(id: string, state: State) {
		sheet.setState(id, state);
		ui.celebrate(sheet.finished);
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
		<section class="group" data-group={group.id}>
			{#if group.title !== '' || group.synthetic}
				<GroupHeader
					title={group.title}
					seed={group.id}
					collapsed={ui.isCollapsed(group.id)}
					count={group.tasks.length}
					editable={!group.synthetic}
					ontoggle={() => ui.toggleCollapsed(group.id)}
					onrename={(title) => sheet.renameGroup(group.id, title)}
				/>
			{/if}

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

	{#if overLimit}
		<p class="over">{sheet.taskCount} of {LIMITS.tasks} — clear some</p>
	{/if}

	<!-- The same glyph in two type sizes: one more task, or one more group. -->
	<div class="new-group">
		{#if newGroupOpen}
			<!-- svelte-ignore a11y_autofocus -->
			<input
				type="text"
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
		/* Tall enough that the page can always scroll the torn edge to the top. */
		min-height: 100dvh;
		padding: 0 0 2rem;
	}

	.group {
		margin-bottom: 1.75rem;
	}

	.tasks {
		margin: 0;
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

	.new-group button,
	.new-group input {
		font-family: var(--display);
		font-size: var(--size-title);
		margin-left: var(--touch);
		text-align: left;
		text-decoration: underline;
		text-underline-offset: 4px;
	}

	.new-group input {
		text-transform: none;
		letter-spacing: normal;
		outline: none;
		cursor: text;
	}

	.new-group button:disabled {
		opacity: 0.4;
		cursor: default;
	}
</style>
