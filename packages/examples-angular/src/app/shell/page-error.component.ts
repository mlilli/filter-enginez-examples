/**
 * `<fe-page-error>` — what the app shows when a page cannot be shown: its code did not load, or its
 * resolver failed.
 *
 * @remarks
 * The markup and words every app renders for this, from
 * `@filter-enginez/examples-shared/page-error-core`, over the shared `.fe-page-error*` classes in the
 * global stylesheet. The root component renders it in place of the routed page after a navigation
 * error (`app.component.ts`). One `<main>` around a `role="alert"` card, like the wine route's
 * boot-error screen.
 *
 * The link to the start page is a plain anchor rather than a `routerLink`: loading the page again is
 * what recovers from a chunk that did not arrive.
 *
 * @packageDocumentation
 */

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
	PAGE_ERROR_HINT,
	PAGE_ERROR_HOME_HREF,
	PAGE_ERROR_HOME_LABEL,
	PAGE_ERROR_TITLE,
	pageErrorDetail,
} from '@filter-enginez/examples-shared/page-error-core';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	selector: 'fe-page-error',
	template: `
		<main class="fe-page-error">
			<div class="fe-page-error__card" role="alert">
				<p class="fe-page-error__title">{{ title }}</p>
				<p class="fe-page-error__detail">{{ detail() }}</p>
				<p class="fe-page-error__hint">{{ hint }}</p>
				<a class="fe-page-error__link" [href]="homeHref">{{ homeLabel }}</a>
			</div>
		</main>
	`,
})
export class PageErrorComponent {
	/** What failed; its message is the detail line. */
	readonly error = input.required<unknown>();

	/** The detail line. */
	protected readonly detail = computed(() => pageErrorDetail(this.error()));

	/** The screen's title. */
	protected readonly title = PAGE_ERROR_TITLE;

	/** What to do about it. */
	protected readonly hint = PAGE_ERROR_HINT;

	/** Where the link goes. */
	protected readonly homeHref = PAGE_ERROR_HOME_HREF;

	/** The link's label. */
	protected readonly homeLabel = PAGE_ERROR_HOME_LABEL;
}
