<script setup lang="ts">
import type { Book } from '@filter-enginez/mock-data/books';
import type { SignalsEngine } from '@filter-enginez/reactive-signals';

/**
 * `<BooksView>` — the Vue books app shell, at visual + functional parity with the React `<BooksApp>`
 * and the Svelte `<BooksView>`. Mobile-first: a single stacked column with the filters behind a toggle
 * on small viewports, promoting to a two-column layout (static filter sidebar + result grid) at the
 * `lg` breakpoint and up.
 *
 * It provides the engine to descendants via Vue provide/inject (parity with React's
 * `<FilterEngineProvider>` / Svelte context), then composes the header + filter panel + results header
 * + card grid + footer over the shared `ui-styles` classes so it looks identical to the React/Svelte
 * apps. The engine is booted + held in `shallowRef` by the route (`BooksPage.vue`) and handed here as a
 * prop.
 */
import { DESKTOP_MEDIA_QUERY } from '@filter-enginez/examples-shared/viewport-core';
import { provideFilterEngine, useBusy, useEngineRefs } from '@filter-enginez/vue-signals';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';

import DevtoolsPanel from '../controls/DevtoolsPanel.vue';
import TimeTravelControls from '../controls/TimeTravelControls.vue';
import AppHeaderBrand from '../shell/AppHeaderBrand.vue';
import CompareLinkButton from '../url/CompareLinkButton.vue';
import CopyLinkButton from '../url/CopyLinkButton.vue';
import UrlFormatToggle from '../url/UrlFormatToggle.vue';
import { booksBusyTracker, captureCurrentVersion, markResolvedAtLeast, markUserAction } from './booksBusy.js';
import BooksFilterPanel from './BooksFilterPanel.vue';
import ResultGrid from './ResultGrid.vue';
import ResultsHeader from './ResultsHeader.vue';

const props = defineProps<{ engine: SignalsEngine<Book> }>();

// Provide the engine to descendants (parity with React's <FilterEngineProvider> / Svelte context).
provideFilterEngine(props.engine);
const { lastChange, mode, results } = useEngineRefs(props.engine);

// Two-column breakpoint switch + mobile filter visibility. `matchMedia` is guarded so the component
// renders in SSR / jsdom (where it's absent): there `isDesktop` stays `true` and the panel is shown.
const isDesktop = ref(true);
const isFilterOpen = ref(true);
let mediaQuery: MediaQueryList | null = null;

function applyMediaState(): void {
	if (mediaQuery !== null) {
		isDesktop.value = mediaQuery.matches;
		isFilterOpen.value = mediaQuery.matches;
	}
}

onMounted(() => {
	if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
		return;
	}
	mediaQuery = window.matchMedia(DESKTOP_MEDIA_QUERY);
	applyMediaState();
	mediaQuery.addEventListener('change', applyMediaState);
});

onUnmounted(() => {
	mediaQuery?.removeEventListener('change', applyMediaState);
});

// Resolve the engine-busy tracker on every settle. The books engine is synchronous main-thread, so a
// settle is simply the next `lastChange` snapshot: advancing the resolved version to the current
// user-action version there clears the "computing" indicator a frame after the recompute lands (parity
// with the React `<BooksApp>`'s `useEffect(() => markResolvedAtLeast(captureCurrentVersion()))`).
watch(
	lastChange,
	() => {
		markResolvedAtLeast(captureCurrentVersion());
	},
	{ immediate: true },
);

const showPanel = computed(() => isDesktop.value || isFilterOpen.value);

/** Devtools panel visibility. Hidden by default so a first visit gets a clean page. */
const isDevtoolsOpen = ref(false);
const isEngineBusy = useBusy(booksBusyTracker);
</script>

<template>
	<div class="fe-books-app">
		<header class="fe-books-app__header">
			<AppHeaderBrand page="Books" />
			<div class="fe-books-app__url-controls">
				<!-- Time travel is an ENGINE feature, not a React one; only the view is per-framework.
				     Same three controls, same icons, same order as React. -->
				<TimeTravelControls
					:engine="props.engine"
					:is-devtools-open="isDevtoolsOpen"
					:mark-busy="markUserAction"
					@toggle-devtools="isDevtoolsOpen = !isDevtoolsOpen"
				/>
				<UrlFormatToggle />
				<CopyLinkButton />
				<CompareLinkButton dataset="books" />
			</div>
		</header>

		<main class="fe-books-app__main">
			<aside class="fe-books-app__sidebar">
				<button
					v-if="!isDesktop"
					type="button"
					class="fe-books-app__filters-toggle"
					:aria-expanded="isFilterOpen"
					@click="isFilterOpen = !isFilterOpen"
				>
					<svg
						viewBox="0 0 24 24"
						width="18"
						height="18"
						fill="none"
						stroke="currentColor"
						stroke-width="1.75"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<path d="M3 5h18M6 12h12M10 19h4" />
					</svg>
					{{ isFilterOpen ? 'Hide filters' : 'Filters' }}
				</button>
				<BooksFilterPanel v-if="showPanel" />
			</aside>

			<section class="fe-books-app__results">
				<ResultsHeader />
				<!-- An inline card in the document flow, not an overlay: it pushes the grid down rather
				     than covering it, because the point of scrubbing the timeline is watching the
				     RESULTS change. -->
				<DevtoolsPanel
					v-if="isDevtoolsOpen"
					:engine="props.engine"
					:is-computing="isEngineBusy"
					:mark-busy="markUserAction"
					@close="isDevtoolsOpen = false"
				/>
				<ResultGrid :results="results" />
			</section>
		</main>

		<footer class="fe-books-app__footer">
			<span>filter-enginez · books demo · vue + main-thread engine</span>
			<span>
				engine mode
				<code>{{ mode }}</code>
				· data via
				<code>@filter-enginez/mock-data</code>
			</span>
		</footer>
	</div>
</template>
