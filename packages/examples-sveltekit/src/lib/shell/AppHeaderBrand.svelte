<script lang="ts">
	/**
	 * `<AppHeaderBrand>` — the brand at the left of every header in this app.
	 *
	 * @remarks
	 * The logomark and the `FILTER ENGINEZ` wordmark link home to the landing site; the subtitle names
	 * the page and the app, and the app's name links back to this app's hub; "All demos" links to the
	 * landing page's list of every demo, and `ui-styles` shows it from the `lg` breakpoint up. The
	 * strings and the URLs come from `@filter-enginez/examples-shared/app-header-core`, which every app
	 * renders from; the markup and its classes are the `fe-books-app__brand` family `ui-styles`
	 * documents, element for element the same as the other five apps'.
	 *
	 * **The landing-site links are resolved from `$page.url`, not `window.location`.** SvelteKit fills
	 * `page.url` on the server as well as in the browser, and the shared resolver reads only its
	 * `hostname` and `origin`, so the hub and the 404 — the two pages that render this on the server —
	 * carry the right absolute URLs in the served HTML: the deployed site from a deployed host, the
	 * local site server from a loopback one. Both are absolute, cross-origin URLs, which SvelteKit's
	 * router leaves to the browser.
	 *
	 * The hub link is a plain `<a href="/">`, the SvelteKit idiom for an in-app link: the router takes
	 * the click and navigates client-side. It is marked `aria-current="page"` on the hub itself.
	 *
	 * Every page renders it inside `<header class="fe-books-app__header">`: a dataset route's header
	 * beside its controls, and the hub's and the 404's on its own.
	 */

	import type { EngineTier } from '@filter-enginez/examples-shared/verticals';

	import {
		ALL_DEMOS_LABEL,
		APP_HUB_PATH,
		appHeaderLinks,
		appHeaderSubtitle,
		BRAND_NAV_LABEL,
		SITE_HOME_LABEL,
	} from '@filter-enginez/examples-shared/app-header-core';
	import { page } from '$app/stores';

	interface Props {
		/**
		 * What the page is: a dataset (`Wine`) on a dataset route, otherwise one of the shared
		 * `HEADER_PAGE_LABELS` (`Datasets` on the hub, `Not found` on the 404).
		 */
		readonly page: string;
		/** The engine tier the route runs, when it names one (`worker`, `server`). */
		readonly tier?: EngineTier;
	}

	// `pageLabel`, because `page` in this file is SvelteKit's page store.
	const { page: pageLabel, tier }: Props = $props();

	const links = $derived(appHeaderLinks($page.url));
	const subtitle = $derived(appHeaderSubtitle(pageLabel, 'sveltekit', tier));
	const isOnHub = $derived($page.url.pathname === APP_HUB_PATH);
</script>

<!-- The subtitle's parts sit on one line: whitespace between them would be rendered, and the
     subtitle's text must read exactly as `verticalSubtitle` builds it. -->
<nav class="fe-books-app__brand" aria-label={BRAND_NAV_LABEL}>
	<a class="fe-books-app__home" href={links.homeHref} aria-label={SITE_HOME_LABEL}>
		<img class="fe-books-app__mark" src="/mark.svg" alt="" width="36" height="36" />
	</a>
	<span class="fe-books-app__wordmark">
		<!-- The wordmark repeats the home link for the pointer only: out of the tab order and the
		     accessibility tree, so assistive technology meets one home link, not two. -->
		<a class="fe-books-app__name" href={links.homeHref} tabindex="-1" aria-hidden="true">Filter EngineZ</a>
		<span class="fe-books-app__subtitle">{subtitle.lead}{#if subtitle.hub !== null}<a class="fe-books-app__hub" href={subtitle.hub.href} aria-label={subtitle.hub.label} aria-current={isOnHub ? 'page' : undefined}>{subtitle.hub.text}</a>{subtitle.trail}{/if}</span>
	</span>
	<a class="fe-books-app__nav-link fe-books-app__all-demos" href={links.allDemosHref}>{ALL_DEMOS_LABEL}</a>
</nav>
