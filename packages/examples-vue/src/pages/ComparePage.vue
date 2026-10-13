<script setup lang="ts">
/**
 * `/compare` — one filter state, rendered as a link into each demo app serving the dataset.
 *
 * The Vue shell, at parity with React's `<ComparePage>` and SvelteKit's `<CompareView>`. Every
 * decision it makes — which datasets exist, where each vertical lives, how one serialized state
 * becomes six links, which state a cold visit transports — comes from
 * `@filter-enginez/examples-shared/compare-core`. This file contributes Vue idiom and nothing else,
 * which is the page's own claim applied to the page.
 *
 * ### The three lines that are actually Vue
 *
 * `useRoute().query` for the parameters, `urlFormat` as a `ref`, and `window.location` for the
 * origins. That is the entire delta from the Svelte shell — the markup below is the same tree over
 * the same `fe-compare__*` classes, because both render `compareLinks` output.
 *
 * **`useRoute()`, not `window.location.search`.** Vue Router owns the query here, and reading the
 * global instead would leave the dataset and preset toggles inert: they are `<RouterLink>`s, so a
 * click resolves client-side without touching `location` in a way a non-reactive read would see. The
 * six ROW links are deliberately the opposite — plain `<a>`, full navigations — see below.
 *
 * ### No SSR here, and that is a property of the vertical rather than a shortcut
 *
 * The SvelteKit shell server-renders its links, because SvelteKit hands it a `page.url` on the
 * server. This is a Vite SPA with no server tier, so `window.location` is the only answer available
 * and the list exists after mount — the same position React's shell is in. The shared
 * `CompareLocation` is structural precisely so a vertical that CAN do better is free to.
 */
import {
	COMPARE_DATASETS,
	COMPARE_PRESETS,
	compareHeading,
	compareLinks,
	compareListLabel,
	DATASET_LABELS,
	DATASET_PARAM,
	PRESET_PARAM,
	readCompareDataset,
	resolveCompareState,
	URL_STATE_PARAM,
} from '@filter-enginez/examples-shared/compare-core';
import { computed } from 'vue';
import { RouterLink, useRoute } from 'vue-router';

import { urlFormat } from '../url/urlState.js';

const route = useRoute();

/**
 * Narrow one query value to a string.
 *
 * @remarks
 * Vue Router types every query value as `string | null | (string | null)[]`, because `?a=1&a=2` is
 * legal. Every parameter this page reads is single-valued, and a repeated one is a malformed URL
 * rather than a case to support — so the array arm collapses to its first entry instead of being
 * rejected at a visitor.
 */
function single(value: (string | null)[] | string | null | undefined): string | null {
	if (Array.isArray(value)) {
		return value[0] ?? null;
	}

	return value ?? null;
}

const dataset = computed(() => readCompareDataset(single(route.query[DATASET_PARAM])));
const presets = computed(() => COMPARE_PRESETS[dataset.value]);
const inboundState = computed(() => single(route.query[URL_STATE_PARAM]));
const presetId = computed(() => single(route.query[PRESET_PARAM]));

// The rule deciding WHAT is transported is shared — `compare-core`'s `state.ts`. An inbound `?f=`
// travels verbatim; otherwise a preset is encoded in this app's currently selected format.
const state = computed(() =>
	resolveCompareState({
		dataset: dataset.value,
		format: urlFormat.value,
		inboundState: inboundState.value,
		presetId: presetId.value,
	}),
);

const links = computed(() =>
	compareLinks({
		dataset: dataset.value,
		location: window.location,
		serialized: state.value.serialized,
	}),
);
</script>

<template>
	<main class="fe-compare">
		<p class="fe-compare__eyebrow">Engine portability</p>
		<h1 class="fe-compare__heading">{{ compareHeading(dataset) }}</h1>
		<p class="fe-compare__lede">
			Every vertical reads its state from the same <code>?f</code> parameter, through a serializer
			whose decode detects its own format tag. A link built here opens in any of them — React, Vue,
			Svelte, Angular, or no framework at all — and reproduces the identical result set.
		</p>

		<div class="fe-compare__controls">
			<div class="fe-compare__group" role="group" aria-label="Dataset">
				<RouterLink
					v-for="candidate in COMPARE_DATASETS"
					:key="candidate"
					:to="`?${DATASET_PARAM}=${candidate}`"
					class="fe-compare__toggle"
					:class="{ 'fe-compare__toggle--selected': candidate === dataset }"
					:aria-current="candidate === dataset ? 'true' : undefined"
				>
					{{ DATASET_LABELS[candidate] }}
				</RouterLink>
			</div>

			<div v-if="inboundState === null" class="fe-compare__group" role="group" aria-label="Example state">
				<RouterLink
					v-for="preset in presets"
					:key="preset.id"
					:to="`?${DATASET_PARAM}=${dataset}&${PRESET_PARAM}=${preset.id}`"
					class="fe-compare__toggle"
					:class="{ 'fe-compare__toggle--selected': preset.id === (presetId ?? presets[0].id) }"
					:aria-current="preset.id === (presetId ?? presets[0].id) ? 'true' : undefined"
					:title="preset.description"
				>
					{{ preset.label }}
				</RouterLink>
			</div>
		</div>

		<div class="fe-compare__state">
			<span class="fe-compare__state-label">{{ state.sourceLabel }}</span>
			<code class="fe-compare__state-value">{{ state.serialized }}</code>
		</div>

		<ul class="fe-compare__list" :aria-label="compareListLabel(dataset)">
			<li v-for="link in links" :key="link.vertical.id" class="fe-compare__row">
				<div class="fe-compare__row-head">
					<!-- A plain anchor, never a RouterLink: four of the six verticals hydrate `?f` only at
					     mount, so a client-side transition would leave their engines untouched. Five of these
					     are cross-origin and could not be intercepted anyway — it is this app's own row where
					     a router link would silently do nothing, which is the hardest case to notice. -->
					<a class="fe-compare__row-name" :href="link.href">{{ link.vertical.name }}</a>
					<span class="fe-compare__row-framework">{{ link.vertical.framework }}</span>
				</div>
				<p class="fe-compare__row-blurb">{{ link.vertical.blurb }}</p>
				<p class="fe-compare__row-binding">
					<code>{{ link.vertical.binding ?? 'no binding — bare core' }}</code>
					<span class="fe-compare__row-surface">{{ link.vertical.surface }}</span>
				</p>
			</li>
		</ul>

		<p class="fe-compare__footnote">
			Links are full navigations by design: four of the six hydrate <code>?f</code> only at mount, so
			a client-side transition would leave their engines untouched.
			<RouterLink to="/">Back to the dataset hub</RouterLink>
		</p>
	</main>
</template>
