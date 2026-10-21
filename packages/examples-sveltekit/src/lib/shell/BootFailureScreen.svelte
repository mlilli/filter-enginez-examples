<script lang="ts">
	/**
	 * `<BootFailureScreen>` — what a dataset route shows when its engine could not start.
	 *
	 * @remarks
	 * The same screen in every app: a `<main>` holding an element with `role="alert"` that says the
	 * dataset's title, the error's own message, and the dataset's hint, all from `BOOT_FAILURE_COPY` in
	 * `@filter-enginez/examples-shared/boot-caption`. The `<main>` sits AROUND the alert rather than
	 * carrying the role itself, because a `role` on the element would replace the landmark.
	 *
	 * `remedy` is for what follows the hint and is a fact about this app's build rather than about the
	 * engine: the wine route names `VITE_WINE_TIER=default`, the switch that boots the 10,000-wine tier
	 * on the main thread instead of the worker.
	 */

	import type { Snippet } from 'svelte';

	import { BOOT_FAILURE_COPY, type BootFailureDataset } from '@filter-enginez/examples-shared/boot-caption';

	interface Props {
		/** Which dataset failed to start. */
		readonly dataset: BootFailureDataset;
		/** The error's message. */
		readonly message: string;
		/** This app's own remedy, rendered after the hint. */
		readonly remedy?: Snippet;
	}

	const { dataset, message, remedy }: Props = $props();

	const copy = $derived(BOOT_FAILURE_COPY[dataset]);
</script>

<main>
	<div class="fe-boot-failure" role="alert">
		<p class="fe-boot-failure__title">{copy.title}</p>
		<p class="fe-boot-failure__detail">{message}</p>
		<p class="fe-boot-failure__hint">
			{copy.hint}
			{#if remedy}
				{@render remedy()}
			{/if}
		</p>
	</div>
</main>

<style>
	.fe-boot-failure {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin: 3rem auto;
		max-width: 36rem;
		padding: 1.5rem;
	}

	.fe-boot-failure__title {
		/* A boot FAILURE, not engine activity. Phosphor would claim the engine is working. */
		color: var(--danger);
		font-size: 1.125rem;
		font-weight: 600;
	}

	.fe-boot-failure__detail {
		color: var(--gray-11);
		font-family: var(--font-mono, monospace);
		font-size: 0.875rem;
	}

	.fe-boot-failure__hint {
		color: var(--gray-8);
		font-size: 0.875rem;
	}
</style>
