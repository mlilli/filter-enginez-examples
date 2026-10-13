<script lang="ts">
	/**
	 * `/compare` — the cross-app comparison route.
	 *
	 * Deliberately thin. Everything this page decides lives in
	 * `@filter-enginez/examples-shared/compare-core`, and everything it renders lives in
	 * `$lib/compare/CompareView.svelte`; the only job here is reading the three query parameters off
	 * the URL and handing them down. The split exists because `vitest.config.ts` aliases `$lib` and
	 * nothing else — a component importing `$app/stores` has no module to resolve under test, so any
	 * logic living here would be logic no component test could reach.
	 *
	 * `$page.url` rather than `window.location`, and that is the whole SSR story: `CompareLocation` is
	 * a structural `{ hostname, origin }`, `page.url` is a `URL`, and SvelteKit populates it on the
	 * server as well as the client. So the six links are in the served HTML and `/compare` works here
	 * with JavaScript disabled — which the React shell cannot do, because it reads a browser global.
	 *
	 * `$app/stores` rather than `$app/state`, matching `routes/+error.svelte`, the app's only other
	 * consumer. The newer rune-based module would work; one idiom per app is worth more than being
	 * current in half of it.
	 */

	import {
		DATASET_PARAM,
		PRESET_PARAM,
		readCompareDataset,
		URL_STATE_PARAM,
	} from '@filter-enginez/examples-shared/compare-core';
	import { page } from '$app/stores';
	import CompareView from '$lib/compare/CompareView.svelte';

	const parameters = $derived($page.url.searchParams);
</script>

<svelte:head>
	<title>Filter EngineZ · One filter state, six stacks</title>
</svelte:head>

<CompareView
	dataset={readCompareDataset(parameters.get(DATASET_PARAM))}
	inboundState={parameters.get(URL_STATE_PARAM)}
	location={$page.url}
	presetId={parameters.get(PRESET_PARAM)}
/>
