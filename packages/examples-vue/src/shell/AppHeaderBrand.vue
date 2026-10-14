<script setup lang="ts">
/**
 * `<AppHeaderBrand>` — the brand every header of this app carries, at parity with the React
 * `<AppHeaderBrand>` and the vanilla `createAppHeaderBrand`.
 *
 * @remarks
 * The logomark and the `FILTER ENGINEZ` wordmark link home to the landing site; the subtitle names the
 * page and the app, and the app's name links back to this app's hub; "All demos" links to the landing
 * page's list of every demo, and `ui-styles` shows it from the `lg` breakpoint up. The strings and the
 * URLs come from `@filter-enginez/examples-shared/app-header-core`, which every app renders from; the
 * markup and its classes are the `fe-books-app__brand` family `ui-styles` documents.
 *
 * **Two kinds of link, two elements.** The links to the landing site are absolute URLs on another
 * origin, so they are plain anchors the browser owns. The hub link is `/`, an in-app route, so it is a
 * `<RouterLink>` like every other internal link here: a plain anchor would reload the whole app. Its
 * `aria-current="page"` is the router's own, which `<RouterLink>` sets only while the current route is
 * exactly the one it links to — on the hub, and on no other page.
 *
 * **One home link, as far as assistive technology can tell.** The wordmark repeats the logomark's link
 * for the pointer only, out of the tab order and the accessibility tree, so a keyboard or screen-reader
 * user meets one link home rather than two in a row with the same name.
 */
import {
	ALL_DEMOS_LABEL,
	appHeaderLinks,
	appHeaderSubtitle,
	BRAND_NAV_LABEL,
	SITE_HOME_LABEL,
} from '@filter-enginez/examples-shared/app-header-core';
import { type EngineTier } from '@filter-enginez/examples-shared/verticals';
import { computed } from 'vue';
import { RouterLink } from 'vue-router';

const props = defineProps<{
	/** The dataset or page the header belongs to, e.g. `Wine` or a `HEADER_PAGE_LABELS` entry. */
	page: string;
	/** The engine tier the route runs, when its subtitle names one. */
	tier?: EngineTier;
}>();

/**
 * The landing-site links for this page's location. Read once: only `hostname` and `origin` are used,
 * and neither changes within a session.
 */
const { allDemosHref, homeHref } = appHeaderLinks(window.location);

/** The subtitle, split around the app name that links to the hub. */
const subtitle = computed(() => appHeaderSubtitle(props.page, 'vue', props.tier));
</script>

<template>
	<nav class="fe-books-app__brand" :aria-label="BRAND_NAV_LABEL">
		<a class="fe-books-app__home" :href="homeHref" :aria-label="SITE_HOME_LABEL">
			<img class="fe-books-app__mark" src="/mark.svg" alt="" width="36" height="36" />
		</a>
		<span class="fe-books-app__wordmark">
			<a class="fe-books-app__name" :href="homeHref" tabindex="-1" aria-hidden="true">Filter EngineZ</a>
			<!-- One line on purpose: the parts concatenate to the whole subtitle, and a line break between
			     them would render as a space. -->
			<span class="fe-books-app__subtitle">{{ subtitle.lead }}<RouterLink v-if="subtitle.hub" class="fe-books-app__hub" :to="subtitle.hub.href" :aria-label="subtitle.hub.label">{{ subtitle.hub.text }}</RouterLink>{{ subtitle.trail }}</span>
		</span>
		<a class="fe-books-app__nav-link fe-books-app__all-demos" :href="allDemosHref">{{ ALL_DEMOS_LABEL }}</a>
	</nav>
</template>
