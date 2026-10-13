/**
 * `/compare` — one filter state, rendered as a link into each vertical serving the dataset.
 *
 * @remarks
 * The framework-less shell, at parity with React, SvelteKit, Vue and Angular. Every decision it makes — which
 * datasets exist, where each vertical lives, how one serialized state becomes six links, what a cold
 * visit transports — comes from `@filter-enginez/examples-shared/compare-core`. What is left here is
 * DOM construction, which is this vertical's entire contribution and its entire point.
 *
 * That is the argument the page is making: with no reactivity to bridge and no template language, a
 * shell over the shared core is a function from three query parameters to a tree of elements.
 *
 * ## The two things the hand-written router changes
 *
 * **The toggles are `/compare?…`, not `?…`.** `router.ts` intercepts a click only when the `href`
 * starts with `/`; anything else is left to the browser. The React, SvelteKit and Vue shells write
 * bare `?dataset=books` because their routers resolve relative queries (Angular binds
 * `[queryParams]`), and writing a bare query here would work —
 * as a full page reload — which is a silently worse version of the same behavior. The absolute form
 * is what makes these client-side navigations in this vertical.
 *
 * **The six row links need no special handling.** They are absolute URLs, so the same `startsWith('/')`
 * check leaves them to the browser — including this app's own row, which is the one an SPA router
 * would otherwise capture. The other shells each need an explicit opt-out there (`data-sveltekit-reload`,
 * a plain `<a>` instead of a `<RouterLink>`); here the router's own rule already says the right thing.
 *
 * ## Why the format is read once
 *
 * `getUrlFormat()` rather than a `subscribeUrlFormat` subscription: `/compare` renders no format
 * toggle, so the value cannot change while this page is mounted. The reactive shells look like they
 * do more here only because their stores are ambient — none of them can observe a change either.
 *
 * @packageDocumentation
 */

import {
	COMPARE_DATASETS,
	COMPARE_PRESETS,
	compareHeading,
	compareLinks,
	compareListLabel,
	DATASET_LABELS,
	DATASET_PARAM,
	PRESET_PARAM,
	readCompareDataset,
	resolveCompareState,
	URL_STATE_PARAM,
} from '@filter-enginez/examples-shared/compare-core';
import { el } from '@filter-enginez/examples-shared/dom';

import type { RouteRenderResult } from '../router.js';

import { getUrlFormat } from '../url/urlState.js';

/** This route's own path, used to build absolute toggle hrefs the router will intercept. */
const COMPARE_PATH = '/compare';

/** One toggle in a control group. */
function toggle(href: string, label: string, isSelected: boolean, title?: string): HTMLElement {
	return el('a', {
		attrs: { 'aria-current': isSelected ? 'true' : null, href, title: title ?? null },
		className: isSelected ? 'fe-compare__toggle fe-compare__toggle--selected' : 'fe-compare__toggle',
		text: label,
	});
}

/** A labelled group of toggles. */
function group(label: string, children: readonly HTMLElement[]): HTMLElement {
	return el('div', {
		attrs: { 'aria-label': label, role: 'group' },
		children: [...children],
		className: 'fe-compare__group',
	});
}

/**
 * Render the comparison page.
 *
 * @param container - The route container.
 * @returns `undefined` — this route holds no listeners, no engine and no observers to undo.
 */
export function renderComparePage(container: HTMLElement): RouteRenderResult {
	const parameters = new URLSearchParams(window.location.search);
	const dataset = readCompareDataset(parameters.get(DATASET_PARAM));
	const inboundState = parameters.get(URL_STATE_PARAM);
	const presetId = parameters.get(PRESET_PARAM);
	const presets = COMPARE_PRESETS[dataset];
	const { serialized, sourceLabel } = resolveCompareState({
		dataset,
		format: getUrlFormat(),
		inboundState,
		presetId,
	});
	const links = compareLinks({ dataset, location: window.location, serialized });

	const controls = [
		group(
			'Dataset',
			COMPARE_DATASETS.map((candidate) =>
				toggle(
					`${COMPARE_PATH}?${DATASET_PARAM}=${candidate}`,
					DATASET_LABELS[candidate],
					candidate === dataset,
				),
			),
		),
	];

	// Offering a preset to someone who arrived via a shared link would replace the thing they followed
	// the link to see. Every other shell makes the same call.
	if (inboundState === null) {
		const selectedPresetId = presetId ?? presets[0].id;

		controls.push(
			group(
				'Example state',
				presets.map((preset) =>
					toggle(
						`${COMPARE_PATH}?${DATASET_PARAM}=${dataset}&${PRESET_PARAM}=${preset.id}`,
						preset.label,
						preset.id === selectedPresetId,
						preset.description,
					),
				),
			),
		);
	}

	container.append(
		el('main', {
			children: [
				el('p', { className: 'fe-compare__eyebrow', text: 'Engine portability' }),
				el('h1', {
					className: 'fe-compare__heading',
					text: compareHeading(dataset),
				}),
				el('p', {
					className: 'fe-compare__lede',
					text:
						'Every vertical reads its state from the same ?f parameter, through a serializer whose '
						+ 'decode detects its own format tag. A link built here opens in any of them — React, Vue, '
						+ 'Svelte, Angular, or no framework at all — and reproduces the identical result set.',
				}),
				el('div', { children: controls, className: 'fe-compare__controls' }),
				el('div', {
					children: [
						el('span', { className: 'fe-compare__state-label', text: sourceLabel }),
						el('code', { className: 'fe-compare__state-value', text: serialized }),
					],
					className: 'fe-compare__state',
				}),
				el('ul', {
					attrs: { 'aria-label': compareListLabel(dataset) },
					children: links.map((link) =>
						el('li', {
							children: [
								el('div', {
									children: [
										el('a', {
											attrs: { href: link.href },
											className: 'fe-compare__row-name',
											text: link.vertical.name,
										}),
										el('span', {
											className: 'fe-compare__row-framework',
											text: link.vertical.framework,
										}),
									],
									className: 'fe-compare__row-head',
								}),
								el('p', { className: 'fe-compare__row-blurb', text: link.vertical.blurb }),
								el('p', {
									children: [
										el('code', { text: link.vertical.binding ?? 'no binding — bare core' }),
										el('span', {
											className: 'fe-compare__row-surface',
											text: link.vertical.surface,
										}),
									],
									className: 'fe-compare__row-binding',
								}),
							],
							className: 'fe-compare__row',
						}),
					),
					className: 'fe-compare__list',
				}),
				el('p', {
					children: [
						el('span', {
							text:
								'Links are full navigations by design: four of the six hydrate ?f only at mount, so a '
								+ 'client-side transition would leave their engines untouched. ',
						}),
						el('a', { attrs: { href: '/' }, text: 'Back to the dataset hub' }),
					],
					className: 'fe-compare__footnote',
				}),
			],
			className: 'fe-compare',
		}),
	);

	return undefined;
}
