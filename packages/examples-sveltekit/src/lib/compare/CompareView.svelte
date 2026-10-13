<script lang="ts">
	/**
	 * `<CompareView>` — one filter state, rendered as a link into each demo app serving the dataset.
	 *
	 * The SvelteKit half of `/compare`, at parity with the React `<ComparePage>` and sharing every
	 * decision with it: which datasets exist, where each vertical lives, how one serialized state
	 * becomes six links, and the ready-made states for a cold visit all come from
	 * `@filter-enginez/examples-shared/compare-core`. This file contributes markup and Svelte idiom,
	 * nothing else — which is the claim the page itself is making, applied to the page.
	 *
	 * ### Why this is a `$lib` component and not the route
	 *
	 * It takes its four inputs as PROPS and imports nothing from `$app/*`. That is load-bearing rather
	 * than tidy: `vitest.config.ts` aliases `$lib` and nothing else, so a component importing
	 * `$app/stores` cannot be mounted by `@testing-library/svelte` at all — there is no module to
	 * resolve. The route (`routes/compare/+page.svelte`) is the thin adapter that reads `page.url` and
	 * hands the pieces down, and it holds no logic worth testing. Same split, and the same reason, as
	 * `<BooksView>` and the components that consume `urlState.ts`.
	 *
	 * ### This renders on the SERVER, links and all
	 *
	 * The React page cannot: it reads `window.location`, so its link list only exists after mount.
	 * This one takes a {@link CompareLocation} — a structural `{ hostname, origin }` rather than a
	 * `Location` — so SvelteKit's own `page.url` satisfies it and the six links are in the SSR HTML.
	 * `/compare` therefore works with JavaScript disabled in this app, which is the thing this app is
	 * in the repo to demonstrate. The structural signature also keeps the component testable without a
	 * real `Location`.
	 *
	 * One consequence worth stating rather than discovering: the serialized value is encoded in
	 * whichever format `urlFormat` holds, and that store reads `localStorage`, which the server does
	 * not have. So a visitor whose stored preference is not `human-readable` sees the readout and the
	 * six hrefs re-encode once as the client takes over. That is a reactive update in Svelte 5 rather
	 * than a hydration error, it lands well inside a frame, and the alternative — suppressing SSR for
	 * the whole list to avoid it — would trade the page's headline property for a cosmetic one.
	 */

	import {
		COMPARE_DATASETS,
		COMPARE_PRESETS,
		type CompareDataset,
		compareHeading,
		compareLinks,
		compareListLabel,
		type CompareLocation,
		DATASET_LABELS,
		DATASET_PARAM,
		PRESET_PARAM,
		resolveCompareState,
	} from '@filter-enginez/examples-shared/compare-core';
	import { urlFormat } from '$lib/url/urlState.js';

	/** Everything the route reads off the URL, handed down so this component touches no global. */
	interface CompareViewProps {
		/** Which dataset the table is showing. */
		readonly dataset: CompareDataset;
		/** A `?f=` the visitor arrived with, or `null` when they came in cold. */
		readonly inboundState: string | null;
		/** Where the page is being served from — `page.url` on both the server and the client. */
		readonly location: CompareLocation;
		/** The `?preset=` the visitor chose, or `null` for the default. */
		readonly presetId: string | null;
	}

	const { dataset, inboundState, location, presetId }: CompareViewProps = $props();

	const presets = $derived(COMPARE_PRESETS[dataset]);

	// The rule deciding WHAT is transported lives in `compare-core`'s `state.ts`, shared with React and
	// the three shells behind this one. `$urlFormat` is this vertical's contribution: the same
	// preference, held in a Svelte store rather than a React hook or a Vue ref.
	const state = $derived(
		resolveCompareState({ dataset, format: $urlFormat, inboundState, presetId }),
	);

	const links = $derived(compareLinks({ dataset, location, serialized: state.serialized }));
</script>

<main class="fe-compare">
	<p class="fe-compare__eyebrow">Engine portability</p>
	<h1 class="fe-compare__heading">{compareHeading(dataset)}</h1>
	<p class="fe-compare__lede">
		Every vertical reads its state from the same <code>?f</code> parameter, through a serializer whose
		decode detects its own format tag. A link built here opens in any of them — React, Vue, Svelte,
		Angular, or no framework at all — and reproduces the identical result set.
	</p>

	<div class="fe-compare__controls">
		<div class="fe-compare__group" role="group" aria-label="Dataset">
			{#each COMPARE_DATASETS as candidate (candidate)}
				<a
					href={`?${DATASET_PARAM}=${candidate}`}
					class="fe-compare__toggle"
					class:fe-compare__toggle--selected={candidate === dataset}
					aria-current={candidate === dataset ? 'true' : undefined}
				>
					{DATASET_LABELS[candidate]}
				</a>
			{/each}
		</div>

		{#if inboundState === null}
			<div class="fe-compare__group" role="group" aria-label="Example state">
				{#each presets as preset (preset.id)}
					{@const isSelected = preset.id === (presetId ?? presets[0]?.id)}
					<a
						href={`?${DATASET_PARAM}=${dataset}&${PRESET_PARAM}=${preset.id}`}
						class="fe-compare__toggle"
						class:fe-compare__toggle--selected={isSelected}
						aria-current={isSelected ? 'true' : undefined}
						title={preset.description}
					>
						{preset.label}
					</a>
				{/each}
			</div>
		{/if}
	</div>

	<div class="fe-compare__state">
		<span class="fe-compare__state-label">{state.sourceLabel}</span>
		<code class="fe-compare__state-value">{state.serialized}</code>
	</div>

	<ul class="fe-compare__list" aria-label={compareListLabel(dataset)}>
		{#each links as link (link.vertical.id)}
			<li class="fe-compare__row">
				<div class="fe-compare__row-head">
					<!-- A plain anchor, not a SvelteKit client-side navigation, and the footnote below says
					     why: four of the six hydrate `?f` only at mount. Five of these six are cross-origin
					     anyway, so only this vertical's own row could ever be intercepted — which is exactly
					     the row where a silent no-op would be hardest to notice. -->
					<a class="fe-compare__row-name" href={link.href} data-sveltekit-reload>
						{link.vertical.name}
					</a>
					<span class="fe-compare__row-framework">{link.vertical.framework}</span>
				</div>
				<p class="fe-compare__row-blurb">{link.vertical.blurb}</p>
				<p class="fe-compare__row-binding">
					<code>{link.vertical.binding ?? 'no binding — bare core'}</code>
					<span class="fe-compare__row-surface">{link.vertical.surface}</span>
				</p>
			</li>
		{/each}
	</ul>

	<p class="fe-compare__footnote">
		Links are full navigations by design: four of the six hydrate <code>?f</code> only at mount, so a
		client-side transition would leave their engines untouched.
		<a href="/">Back to the dataset hub</a>
	</p>
</main>
