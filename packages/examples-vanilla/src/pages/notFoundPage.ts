/**
 * The shared "filtered to zero" 404, framework-less.
 *
 * @remarks
 * The copy, chip vocabulary, and toggle logic all come from
 * `@filter-enginez/examples-shared/notfound-core` (framework-free), rendered over the same
 * `fe-notfound__*` classes from `ui-styles` — so this is the same page the React, Vue, SvelteKit, and
 * Angular verticals show, built by hand. The gag: a cyan `0` result count that never moves, the phosphor
 * `NeuralCluster` churning away (the engine perpetually searching, never matching), and a dead-end
 * filter row where every toggle still yields the empty set.
 *
 * @packageDocumentation
 */

import { appHeaderSubtitle, HEADER_PAGE_LABELS } from '@filter-enginez/examples-shared/app-header-core';
import { el } from '@filter-enginez/examples-shared/dom';
import {
	NOT_FOUND_CHIPS,
	NOT_FOUND_COPY,
	notFoundBody,
	toggleNotFoundChip,
} from '@filter-enginez/examples-shared/notfound-core';

import type { RouteRenderResult } from '../router.js';

import { createNotFoundLoader } from '../brand/indicators.js';
import { createPageHeader } from '../shell/appHeader.js';

/**
 * Render the 404 page.
 *
 * @param container - The route container.
 * @returns `undefined` — the page holds no subscriptions.
 */
export function renderNotFoundPage(container: HTMLElement): RouteRenderResult {
	let selected: readonly string[] = [];
	const chipRow = el('div', {
		attrs: { 'aria-label': 'Dead-end filters — every option yields zero', role: 'group' },
		className: 'fe-notfound__chips',
	});

	/** Repaint the chips from the current selection — the count never budges off zero. */
	function paintChips(): void {
		chipRow.replaceChildren(
			...NOT_FOUND_CHIPS.map((chip) => {
				const isSelected = selected.includes(chip.id);

				return el('button', {
					attrs: { 'aria-pressed': isSelected, type: 'button' },
					children: [chip.label, el('span', { className: 'fe-notfound__chip-badge', text: '0' })],
					className: isSelected ? 'fe-notfound__chip fe-notfound__chip--selected' : 'fe-notfound__chip',
					on: {
						click: () => {
							selected = toggleNotFoundChip(selected, chip.id);
							paintChips();
						},
					},
				});
			}),
		);
	}

	paintChips();

	container.append(
		createPageHeader(appHeaderSubtitle(HEADER_PAGE_LABELS.notFound, 'vanilla')),
		el('main', {
			children: [
				el('p', { className: 'fe-notfound__eyebrow', text: NOT_FOUND_COPY.eyebrow }),
				el('p', {
					attrs: { 'aria-hidden': 'true' },
					className: 'fe-notfound__count',
					text: NOT_FOUND_COPY.count,
				}),
				el('div', { children: [createNotFoundLoader()], className: 'fe-notfound__loader' }),
				el('h1', { className: 'fe-notfound__heading', text: NOT_FOUND_COPY.heading }),
				el('p', { className: 'fe-notfound__body', text: notFoundBody(window.location.pathname) }),
				chipRow,
				el('a', {
					attrs: { href: NOT_FOUND_COPY.ctaHref },
					className: 'fe-notfound__cta',
					text: NOT_FOUND_COPY.ctaLabel,
				}),
			],
			className: 'fe-notfound',
		}),
	);

	return undefined;
}
