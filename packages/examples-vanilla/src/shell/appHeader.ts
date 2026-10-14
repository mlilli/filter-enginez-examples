/**
 * The header brand every page of this app carries, and the compact header for the pages that have no
 * other header content.
 *
 * @remarks
 * The logomark and the `FILTER ENGINEZ` wordmark link home to the landing site; the subtitle names the
 * page and the app, and the app's name links back to this app's hub; "All demos" links to the landing
 * page's list of every demo, and `ui-styles` shows it from the `lg` breakpoint up. The strings and the
 * URLs come from `@filter-enginez/examples-shared/app-header-core`, which every app renders from; the
 * markup and its classes are the `fe-books-app__brand` family `ui-styles` documents.
 *
 * The two links to the landing site are absolute URLs, so the router's same-origin click interception
 * (it takes only hrefs starting with `/`) leaves them to the browser; the hub link is `/`, so the
 * router takes that one, as it does every in-app link.
 *
 * @packageDocumentation
 */

import {
	ALL_DEMOS_LABEL,
	APP_HUB_PATH,
	appHeaderLinks,
	type AppHeaderSubtitle,
	BRAND_NAV_LABEL,
	SITE_HOME_LABEL,
} from '@filter-enginez/examples-shared/app-header-core';
import { el } from '@filter-enginez/examples-shared/dom';

/**
 * Build the header's brand.
 *
 * @param subtitle - The page's subtitle, from `appHeaderSubtitle`.
 * @returns A `<nav>` for the left of a header.
 */
export function createAppHeaderBrand(subtitle: AppHeaderSubtitle): HTMLElement {
	const { allDemosHref, homeHref } = appHeaderLinks(window.location);
	const { hub } = subtitle;
	const hubLink = hub === null
		? null
		: el('a', {
			attrs: {
				'aria-current': window.location.pathname === APP_HUB_PATH ? 'page' : null,
				'aria-label': hub.label,
				href: hub.href,
			},
			className: 'fe-books-app__hub',
			text: hub.text,
		});

	return el('nav', {
		attrs: { 'aria-label': BRAND_NAV_LABEL },
		children: [
			el('a', {
				attrs: { 'aria-label': SITE_HOME_LABEL, href: homeHref },
				children: [
					el('img', {
						attrs: { alt: '', height: 36, src: '/mark.svg', width: 36 },
						className: 'fe-books-app__mark',
					}),
				],
				className: 'fe-books-app__home',
			}),
			el('span', {
				children: [
					// The wordmark repeats the home link for the pointer only: out of the tab order and the
					// accessibility tree, so assistive technology meets one home link, not two.
					el('a', {
						attrs: { 'aria-hidden': 'true', href: homeHref, tabindex: -1 },
						className: 'fe-books-app__name',
						text: 'Filter EngineZ',
					}),
					el('span', {
						children: hubLink === null ? [subtitle.lead] : [subtitle.lead, hubLink, subtitle.trail],
						className: 'fe-books-app__subtitle',
					}),
				],
				className: 'fe-books-app__wordmark',
			}),
			el('a', {
				attrs: { href: allDemosHref },
				className: 'fe-books-app__nav-link fe-books-app__all-demos',
				text: ALL_DEMOS_LABEL,
			}),
		],
		className: 'fe-books-app__brand',
	});
}

/**
 * Build the compact header for a page with nothing else to put in one — the hub and the 404.
 *
 * @param subtitle - The page's subtitle, from `appHeaderSubtitle`.
 * @returns The `<header>`.
 */
export function createPageHeader(subtitle: AppHeaderSubtitle): HTMLElement {
	return el('header', { children: [createAppHeaderBrand(subtitle)], className: 'fe-books-app__header' });
}
