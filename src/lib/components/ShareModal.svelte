<script lang="ts">
	import Modal from './Modal.svelte';
	import { copy } from '$lib/clipboard';
	import { formatCode } from '$lib/crypto/derive';

	type Props = { code: string; onclose: () => void };

	let { code, onclose }: Props = $props();

	let copied = $state(false);

	async function copyCode() {
		copied = await copy(code);
	}
</script>

<Modal title="Share this list" seed="share" {onclose}>
	<!-- Grouped for reading aloud. What gets copied is the bare code. -->
	<p class="code">{formatCode(code)}</p>

	<button type="button" class="caps copy" onclick={copyCode}>
		{copied ? 'Copied' : 'Copy'}
	</button>

	<p>Open the app, tap SYNC, and type this code.</p>

	<p>Anyone with this code can read and change this list.</p>

	<p>
		It is also the only way back in. There is no account and no recovery — if you lose it, the list
		is gone. EXPORT copies everything to the clipboard as plain markdown, and it is the only backup
		this app has.
	</p>

	<p>A list nobody edits for six months is deleted. Reading it does not count; editing does.</p>
</Modal>

<style>
	.code {
		margin: 0 0 1rem;
		font-family: var(--display);
		font-size: var(--size-display);
		letter-spacing: 0.06em;
		overflow-wrap: anywhere;
	}

	.copy {
		min-height: var(--touch);
		padding: 0.5rem 0;
		margin-bottom: 1.5rem;
		text-decoration: underline;
		text-underline-offset: 4px;
	}

	p {
		margin: 0 0 1rem;
		line-height: 1.6;
	}
</style>
