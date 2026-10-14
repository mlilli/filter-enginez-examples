/**
 * `<nav fe-app-header-brand>` — the header brand every page of this app carries.
 *
 * @remarks
 * The logomark and the `FILTER ENGINEZ` wordmark link home to the landing site; the subtitle names the
 * page and the app, and the app's name links back to this app's hub; "All demos" links to the landing
 * page's list of every demo, and `ui-styles` shows it from the `lg` breakpoint up. The strings and the
 * URLs come from `@filter-enginez/examples-shared/app-header-core`, which every app renders from; the
 * markup and its classes are the `fe-books-app__brand` family `ui-styles` documents. The vanilla app's
 * `shell/appHeader.ts` is the reference rendering of the same markup.
 *
 * ### The host IS the `<nav>`
 *
 * The selector is an attribute on a `<nav>` rather than an element of its own, so the brand reaches
 * the DOM exactly as the shared markup describes it: the `<nav class="fe-books-app__brand">` is a
 * direct flex item of `.fe-books-app__header`, beside the control cluster, with no custom element
 * wrapped around it for the header's layout to see. The class and the landmark's name are host
 * bindings, so a call site supplies the `<nav>` and the page, and nothing a call site could forget.
 *
 * ### Two kinds of link
 *
 * The logomark, the wordmark and "All demos" lead to the landing site, another origin, resolved from
 * this page's location so a local run reaches the local site server: plain `href`s, which the browser
 * owns. The hub link is this app's own `/`, so it is a `routerLink`, and `routerLinkActive` marks it
 * `aria-current="page"` while the hub itself is showing — on the path alone, so a query string on the
 * hub does not unmark it.
 *
 * @packageDocumentation
 */

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { type IsActiveMatchOptions, RouterLink, RouterLinkActive } from '@angular/router';
import {
	ALL_DEMOS_LABEL,
	appHeaderLinks,
	type AppHeaderLinks,
	appHeaderSubtitle,
	type AppHeaderSubtitle,
	BRAND_NAV_LABEL,
	SITE_HOME_LABEL,
} from '@filter-enginez/examples-shared/app-header-core';
import { type EngineTier, type VerticalId } from '@filter-enginez/examples-shared/verticals';

/** The app this header belongs to, which the subtitle names and whose hub its app name opens. */
const APP_VERTICAL_ID: VerticalId = 'angular';

/**
 * When the hub link counts as the current page: on the hub's path exactly, whatever the query string,
 * fragment or matrix parameters — the same rule the other apps apply to the path alone.
 */
const HUB_LINK_ACTIVE_MATCH_OPTIONS: IsActiveMatchOptions = {
	fragment: 'ignored',
	matrixParams: 'ignored',
	paths: 'exact',
	queryParams: 'ignored',
};

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: {
		'[attr.aria-label]': 'navLabel',
		class: 'fe-books-app__brand',
	},
	imports: [RouterLink, RouterLinkActive],
	selector: 'nav[fe-app-header-brand]',
	template: `
		<a class="fe-books-app__home" [href]="links.homeHref" [attr.aria-label]="homeLabel">
			<img class="fe-books-app__mark" src="/mark.svg" width="36" height="36" alt="" />
		</a>
		<span class="fe-books-app__wordmark">
			<!--
				The wordmark repeats the home link for the pointer only: out of the tab order and the
				accessibility tree, so assistive technology meets one home link, not two.
			-->
			<a class="fe-books-app__name" [href]="links.homeHref" tabindex="-1" aria-hidden="true">Filter EngineZ</a>
			<!--
				No whitespace between the lead, the hub link and the trail. Angular collapses a run of
				template whitespace beside text to one space, and the lead already ends in one, so a line
				break here would put a second space into the subtitle that e2e waits on as its boot signal.
			-->
			<span class="fe-books-app__subtitle">{{ subtitle().lead }}@if (subtitle().hub; as hub) {
				<a
					class="fe-books-app__hub"
					[routerLink]="hub.href"
					routerLinkActive
					[routerLinkActiveOptions]="hubLinkActiveMatchOptions"
					ariaCurrentWhenActive="page"
					[attr.aria-label]="hub.label"
				>{{ hub.text }}</a>
			}{{ subtitle().trail }}</span>
		</span>
		<a class="fe-books-app__nav-link fe-books-app__all-demos" [href]="links.allDemosHref">{{ allDemosLabel }}</a>
	`,
})
export class AppHeaderBrandComponent {
	/**
	 * The page the header belongs to: the dataset on a dataset route (`Wine`), or one of
	 * `HEADER_PAGE_LABELS` elsewhere.
	 */
	public readonly page = input.required<string>();

	/** The engine tier the route runs, when its subtitle names one (`server`, `worker`). */
	public readonly tier = input<EngineTier>();

	/** The visible text of the link to the landing page's list of every demo. */
	protected readonly allDemosLabel = ALL_DEMOS_LABEL;

	/** The accessible name of the logomark link to the landing site. */
	protected readonly homeLabel = SITE_HOME_LABEL;

	/** When the hub link is marked as the current page — see {@link HUB_LINK_ACTIVE_MATCH_OPTIONS}. */
	protected readonly hubLinkActiveMatchOptions = HUB_LINK_ACTIVE_MATCH_OPTIONS;

	/**
	 * The two landing-site URLs, resolved once from this page's location.
	 *
	 * @remarks
	 * Read once rather than per change detection: the host and the deployment layout cannot change
	 * without a full page load, and every route of this app shares one origin.
	 */
	protected readonly links: AppHeaderLinks = appHeaderLinks(window.location);

	/** The accessible name of the brand's navigation landmark, bound onto the host `<nav>`. */
	protected readonly navLabel = BRAND_NAV_LABEL;

	/**
	 * The subtitle, split around the app name that links to the hub.
	 *
	 * @remarks
	 * Its whole text is exactly `verticalSubtitle(page, 'angular', tier)`, so the string the e2e suite
	 * waits on reads the same with the hub link inside it.
	 */
	protected readonly subtitle = computed<AppHeaderSubtitle>(() =>
		appHeaderSubtitle(this.page(), APP_VERTICAL_ID, this.tier()),
	);
}
