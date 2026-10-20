<script setup lang="ts">
/**
 * `<PageErrorScreen>` — what the app shows when a page cannot be shown: its code did not load, or a
 * navigation into it failed.
 *
 * @remarks
 * The markup and words every app renders for this, from
 * `@filter-enginez/examples-shared/page-error-core`, over the shared `.fe-page-error*` classes. `App.vue`
 * renders it in place of the router view while the router reports a failure (`pageFailure` in
 * `router.ts`). One `<main>` around a `role="alert"` card, like the wine route's boot-error screen.
 *
 * The link to the start page is a plain anchor rather than a `<RouterLink>`, the one internal link in
 * this app that is: loading the page again is what recovers from a chunk that did not arrive.
 */
import {
	PAGE_ERROR_HINT,
	PAGE_ERROR_HOME_HREF,
	PAGE_ERROR_HOME_LABEL,
	PAGE_ERROR_TITLE,
	pageErrorDetail,
} from '@filter-enginez/examples-shared/page-error-core';

const props = defineProps<{
	/** What failed; its message is the detail line. */
	error: unknown;
}>();
</script>

<template>
	<main class="fe-page-error">
		<div class="fe-page-error__card" role="alert">
			<p class="fe-page-error__title">{{ PAGE_ERROR_TITLE }}</p>
			<p class="fe-page-error__detail">{{ pageErrorDetail(props.error) }}</p>
			<p class="fe-page-error__hint">{{ PAGE_ERROR_HINT }}</p>
			<a class="fe-page-error__link" :href="PAGE_ERROR_HOME_HREF">{{ PAGE_ERROR_HOME_LABEL }}</a>
		</div>
	</main>
</template>
