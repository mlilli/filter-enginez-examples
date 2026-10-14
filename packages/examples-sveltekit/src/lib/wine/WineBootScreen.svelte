<script lang="ts">
	/**
	 * `<WineBootScreen>` — the full-screen cold-start loader.
	 *
	 * @remarks
	 * Matched to the React `DatasetBootScreen`: a centred `<BrainSynapse width={520}>` over the page
	 * background, with a single mono uppercase caption beneath it and the live number in cyan.
	 *
	 * **This is the SIGNATURE loader, not the recompute one.** `<NeuralCluster>` is the phosphor
	 * animation that means "a filter is being applied", which is the wrong vocabulary for a cold boot
	 * and not what the React screen shows. The three loaders are a deliberate taxonomy: orbit for idle,
	 * cluster for recompute, synapse for the rare fetch moment.
	 *
	 * The caption has three states — no progress yet, streaming, and corpus-loaded-now-indexing. That
	 * last one matters on this route: after the last row arrives there is still a visible pause while
	 * the bitmap index builds, and a caption stuck on the final count reads as a hang.
	 *
	 * **The wording matches React structurally, not by hand.** It comes from
	 * `@filter-enginez/examples-shared/boot-caption`, which both React apps and vanilla also render,
	 * including the zero-total guard that keeps `{ loaded: 0, total: 0 }` from announcing a finished
	 * load that has not started. One mutation in that module turns this component's suite red along
	 * with theirs.
	 *
	 * The progress snapshot reaches the shared builder unchanged, `isTotalEstimated` included, so the
	 * caption prints `~` before the total only while the local real corpus streams — the one source
	 * that cannot know its length up front.
	 *
	 * **The warning line** appears only on the `'default-tier'` source: the 10,000-wine tier booted on
	 * the main thread because `VITE_WINE_TIER=default` is set. That is a development switch, and a
	 * page quietly running a fifteenth of the corpus without a worker would misrepresent the demo, so
	 * the screen names the switch.
	 */

	import type { WineBootProgress } from '@filter-enginez/examples-shared/wine-core';

	import { bootCaptionParts } from '@filter-enginez/examples-shared/boot-caption';
	import BrainSynapse from '$lib/brand/BrainSynapse.svelte';

	const {
		idleCaption,
		progress,
	}: {
		/** The caption shown before any progress arrives. `/wine` spins up a worker; `/wine-server` has no
		 * worker and no progress stream, so it overrides this to name the real cold-start step.
		 *
		 * ⚠ NO DEFAULT HERE, deliberately. A prop default would make this component a second place that
		 * decides what an idle boot says. Leaving it `undefined` lets `bootCaptionParts` apply
		 * `DEFAULT_IDLE_CAPTION`, so the wording has exactly one home — which
		 * `tests/tooling/bootCaptionSingleSource.test.ts` enforces. */
		idleCaption?: string;
		progress: WineBootProgress | null;
	} = $props();

	// The three states, their wording and the zero-total guard all live in
	// `examples-shared/boot-caption`. What stays here is the only Svelte-specific part: which element
	// carries the accent.
	const captionParts = $derived(bootCaptionParts(progress, { idleCaption, recordNoun: 'bottles' }));
</script>

<div class="fe-wine-boot">
	<BrainSynapse width={520} ariaLabel="Loading wine reviews" />

	<p class="fe-boot-caption fe-boot-caption--hero">
		{#each captionParts as part (part.kind + part.text)}
			{#if part.kind === 'value'}
				<span class="fe-boot-caption__value">{part.text}</span>
			{:else}
				{part.text}
			{/if}
		{/each}
	</p>

	{#if progress?.source === 'default-tier'}
		<p class="fe-wine-boot__warn">
			Serving the 10,000-wine default tier on the main thread (<code>VITE_WINE_TIER=default</code>),
			so the worker tier is not in play. Unset <code>VITE_WINE_TIER</code> to generate the 150,000
			wines in the worker.
		</p>
	{/if}
</div>

<style>
	.fe-wine-boot {
		align-items: center;
		background: var(--gray-0);
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		justify-content: center;
		min-height: 100vh;
		padding: 0 1.5rem;
	}

	/* The caption's live count is `.fe-boot-caption__value` and the caption element itself is
	   `.fe-boot-caption--hero`, both in `ui-styles`, where all six apps share one declaration — so no
	   caption rules live here: Svelte warns on an unused selector, and a scoped rule that duplicates a
	   global one is inert exactly until the global one changes. The LAYOUT stays here: a full-viewport
	   column behind a 520px loader is this screen's own arrangement, and `ui-styles` deliberately has
	   no boot-stage component. */

	.fe-wine-boot__warn {
		/* A configuration warning, not engine activity — phosphor would claim the engine is working. */
		color: var(--danger);
		font-size: 0.8125rem;
		max-width: 34rem;
		text-align: center;
	}
</style>
