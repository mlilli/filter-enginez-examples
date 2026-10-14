<script lang="ts">
	/**
	 * `<BooksView>` — the SvelteKit books app shell, at visual + functional parity with the React
	 * `<BooksApp>`. Mobile-first: a single stacked column with the filters behind a toggle on small
	 * viewports, promoting to a two-column layout (static filter sidebar + result grid) at the `lg`
	 * breakpoint and up.
	 *
	 * It provides the engine to descendants via Svelte context (parity with React's
	 * `<FilterEngineProvider>`), then composes the header + filter panel + results header + card grid +
	 * footer over the shared `ui-styles` classes so it looks identical to the React app. The engine is
	 * booted + held in `$state.raw` by the route (`/books/+page.svelte`) and handed here as a prop.
	 *
	 * @remarks
	 * Deviations from React (all deliberate): the count renders directly
	 * rather than through the 600ms rAF tick; the mobile drawer is an inline collapse rather than an
	 * off-canvas `FilterDrawer`; the header's logomark is the static `/mark.svg` rather than React's
	 * animated `<Mark>`; and the search inputs commit on blur / Enter rather than debounced-per-keystroke.
	 */

	import type { EngineTier } from '@filter-enginez/examples-shared/verticals';
	import type { Book } from '@filter-enginez/mock-data/books';
	import type { SignalsEngine } from '@filter-enginez/reactive-signals';

	import { DESKTOP_MEDIA_QUERY } from '@filter-enginez/examples-shared/viewport-core';
	import { createEngineStores, setFilterEngine } from '@filter-enginez/svelte-signals';

	import DevtoolsPanel from '../controls/DevtoolsPanel.svelte';
	import TimeTravelControls from '../controls/TimeTravelControls.svelte';
	import AppHeaderBrand from '../shell/AppHeaderBrand.svelte';
	import CompareLinkButton from '../url/CompareLinkButton.svelte';
	import CopyLinkButton from '../url/CopyLinkButton.svelte';
	import UrlFormatToggle from '../url/UrlFormatToggle.svelte';
	import { captureCurrentVersion, isEngineBusy, markResolvedAtLeast, markUserAction } from './booksBusy.js';
	import BooksFilterPanel from './BooksFilterPanel.svelte';
	import ResultGrid from './ResultGrid.svelte';
	import ResultsHeader from './ResultsHeader.svelte';

	const {
		engine,
		tier,
	}: {
		engine: SignalsEngine<Book>;
		/**
		 * The engine tier the header's subtitle names. `/books` names none (its engine runs on the main
		 * thread); `/books-server` passes `'server'`.
		 */
		tier?: EngineTier;
	} = $props();

	/** Devtools panel visibility. Hidden by default so a first visit gets a clean page. */
	let isDevtoolsOpen = $state(false);

	// `engine` is passed once by the parent (rendered only after boot) and never reassigned, so reading
	// its initial value for one-time setup is exactly intended — silence the false-positive warnings.
	// svelte-ignore state_referenced_locally
	setFilterEngine(engine);
	// svelte-ignore state_referenced_locally
	const { lastChange, mode, results } = createEngineStores(engine);

	// Two-column breakpoint switch + mobile filter visibility. `matchMedia` is guarded so the component
	// renders in SSR / jsdom (where it's absent): there `isDesktop` stays `true` and the panel is shown.
	let isDesktop = $state(true);
	let isFilterOpen = $state(true);

	$effect(() => {
		if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
			return undefined;
		}
		const mq = window.matchMedia(DESKTOP_MEDIA_QUERY);
		const apply = (): void => {
			isDesktop = mq.matches;
			isFilterOpen = mq.matches;
		};

		apply();
		mq.addEventListener('change', apply);

		return () => {
			mq.removeEventListener('change', apply);
		};
	});

	// Resolve the engine-busy tracker on every settle. The books engine is synchronous main-thread, so a
	// settle is simply the next `lastChange` snapshot: advancing the resolved version to the current
	// user-action version there clears the "computing" indicator a frame after the recompute lands
	// (parity with the React `<BooksApp>`'s `useEffect(() => markResolvedAtLeast(captureCurrentVersion()))`).
	$effect(() => {
		void $lastChange;
		markResolvedAtLeast(captureCurrentVersion());
	});

	const showPanel = $derived(isDesktop || isFilterOpen);
</script>

<div class="fe-books-app">
	<header class="fe-books-app__header">
		<AppHeaderBrand page="Books" {tier} />
		<div class="fe-books-app__url-controls">
			<!-- Time travel is an ENGINE feature, not a React one. Same three controls, same icons, same
			     order as React's header. -->
			<TimeTravelControls
				{engine}
				{isDevtoolsOpen}
				markBusy={markUserAction}
				onToggleDevtools={() => (isDevtoolsOpen = !isDevtoolsOpen)}
			/>
			<UrlFormatToggle />
			<CopyLinkButton />
			<CompareLinkButton dataset="books" />
		</div>
	</header>

	<main class="fe-books-app__main">
		<aside class="fe-books-app__sidebar">
			{#if !isDesktop}
				<button
					type="button"
					class="fe-books-app__filters-toggle"
					aria-expanded={isFilterOpen}
					onclick={() => (isFilterOpen = !isFilterOpen)}
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
					{isFilterOpen ? 'Hide filters' : 'Filters'}
				</button>
			{/if}
			<!-- Hidden, NOT unmounted. `{#if}` here would destroy every control's local state on each
			     mobile close — and, on the real-estate route, tear down and re-init the Leaflet map,
			     refetching tiles and resetting the user's zoom. React's `FilterDrawer keepMounted`
			     made the same call. `hidden` keeps the subtree alive and out of the a11y tree, and
			     `fe-filter-collapse` restores the flex height chain the wrapper otherwise severs — see
			     that rule in ui-styles for why it is scoped `:not([hidden])`. -->
			<div class="fe-filter-collapse" hidden={!showPanel}>
				<BooksFilterPanel />
			</div>
		</aside>

		<section class="fe-books-app__results">
			<ResultsHeader />
			<!-- An inline card in the document flow, not an overlay: it pushes the grid down rather than
			     covering it, because the point of scrubbing the timeline is watching the RESULTS change. -->
			{#if isDevtoolsOpen}
				<DevtoolsPanel
					{engine}
					isComputing={$isEngineBusy}
					markBusy={markUserAction}
					onClose={() => (isDevtoolsOpen = false)}
				/>
			{/if}
			<ResultGrid results={$results} />
		</section>
	</main>

	<footer class="fe-books-app__footer">
		<span>filter-enginez · books demo · svelte + main-thread engine</span>
		<span>
			engine mode <code>{$mode}</code> · data via
			<code>@filter-enginez/mock-data</code>
		</span>
	</footer>
</div>
