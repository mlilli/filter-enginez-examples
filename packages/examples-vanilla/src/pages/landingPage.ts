/**
 * `/` — the landing hub for the framework-less vertical.
 *
 * @remarks
 * The app's compact header (the way home to the landing site, and "All demos"), then a brand-forward
 * hero plus one card per dataset. The two books cards are the same UI over the two
 * reactive surfaces — the comparison this vertical exists to make — wine is the worker-backed tier,
 * and real estate is the widest panel: fourteen sections, a location hierarchy and a geo-radius map,
 * over the same engine.
 *
 * The cards come from `examples-shared/landing`, which derives them from the routes the vertical
 * registry says this app serves, so a route this app serves always has a card. The grid is
 * `fe-landing__grid` from `ui-styles`, which auto-fills, so a new dataset is a registry entry and no
 * change to this file at all.
 *
 * @packageDocumentation
 */

import { appHeaderSubtitle, HEADER_PAGE_LABELS } from '@filter-enginez/examples-shared/app-header-core';
import { el } from '@filter-enginez/examples-shared/dom';
import { type DatasetCard, landingCards } from '@filter-enginez/examples-shared/landing';

import type { RouteRenderResult } from '../router.js';

import { createPageHeader } from '../shell/appHeader.js';

/**
 * Render the landing hub.
 *
 * @param container - The route container.
 * @returns `undefined` — the hub is static, so there is nothing to tear down.
 */
export function renderLandingPage(container: HTMLElement): RouteRenderResult {
	const cards = landingCards('vanilla');

	container.append(
		createPageHeader(appHeaderSubtitle(HEADER_PAGE_LABELS.hub, 'vanilla')),
		// `<main>`, so the hero's own `<header>` sits inside it rather than beside the page header as a
		// second banner landmark.
		el('main', {
			children: [
				el('div', {
					children: [
						el('header', {
							children: [
								el('span', {
									children: [
										el('img', {
											attrs: { alt: 'Filter EngineZ', height: 72, src: '/mark.svg', width: 72 },
											className: 'fe-landing__mark',
										}),
									],
									className: 'fe-landing__glow',
								}),
								el('span', { className: 'fe-landing__wordmark', text: 'Filter EngineZ' }),
								el('p', {
									className: 'fe-landing__tagline',
									text:
										'A generic, isomorphic, framework-agnostic TypeScript filter engine: arbitrarily complex '
										+ 'filters over arbitrarily shaped data, computed client-side. This is the vanilla '
										+ 'vertical — no framework, no reactive-surface adapter, just hand-written DOM.',
								}),
								// Counted, not written. "Three demos" outlived being true by one dataset, in the same
								// commit range that left `/wine` off the grid below it.
								el('p', {
									className: 'fe-landing__prompt',
									text: `${cards.length} datasets, one engine, no framework`,
								}),
							],
							className: 'fe-landing__hero',
						}),
						el('div', {
							children: cards.map(demoCard),
							className: 'fe-landing__grid',
						}),
						el('p', {
							className: 'fe-landing__foot',
							text: 'Same engine, zero framework. Filtering happens in your browser.',
						}),
					],
					className: 'fe-landing__inner',
				}),
			],
			className: 'fe-landing',
		}),
	);

	return undefined;
}

/**
 * One dataset tile.
 *
 * @remarks
 * The markup is the other five verticals' card, node for node — same classes, same order, same
 * `Explore <noun>` call to action. That is the point of the hub: one page rendered in six stacks, so
 * the differences a visitor notices are the ones the demo is about.
 *
 * @internal
 */
function demoCard({ blurb, href, label, recordNoun }: DatasetCard): HTMLElement {
	return el('a', {
		attrs: { 'aria-label': label, href },
		children: [
			el('div', {
				children: [
					el('span', { className: 'fe-landing__card-title', text: label }),
					el('span', { className: 'fe-landing__badge fe-landing__badge--live', text: 'Live' }),
				],
				className: 'fe-landing__card-top',
			}),
			el('p', { className: 'fe-landing__card-blurb', text: blurb }),
			el('span', { className: 'fe-landing__card-cta', text: `Explore ${recordNoun}` }),
		],
		className: 'fe-landing__card fe-landing__card--live',
	});
}
