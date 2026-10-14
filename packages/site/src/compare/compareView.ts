/**
 * The comparison page's view — one filter state, rendered as a link into each demo app serving the
 * dataset — as markup, for the build and for the browser alike.
 *
 * @remarks
 * Every decision the page makes comes from `@filter-enginez/examples-shared/compare-core`: which
 * datasets exist, where each app lives, how one serialized state becomes a link per app, and what a
 * cold visit transports. What is left here is the markup, written once as a string so the same
 * function serves both halves of the page:
 *
 * - **At build time**, {@link prerenderCompare} fills `compare.html` with a cold visit to the default
 *   dataset, linked to the deployed apps, so the page reads in full with no JavaScript and a crawler or
 *   link preview sees real content.
 * - **In the browser**, `comparePage.ts` renders it again from the page's own query string — the
 *   dataset, the preset, and above all a visitor's own `?f=` carried here by an app's Compare button —
 *   and from the page's own host, so a local run links to the local dev servers.
 *
 * Every value reaching the markup passes through {@link escapeHtml}, attributes and text alike. That
 * matters more here than on a page of fixed copy: the inbound `?f=` is whatever the URL says, and it is
 * displayed and carried verbatim by design.
 *
 * @packageDocumentation
 */

import {
	COMPARE_DATASETS,
	COMPARE_PRESETS,
	type CompareDataset,
	compareHeading,
	compareLinks,
	compareListLabel,
	type CompareLocation,
	type CompareStateOptions,
	DATASET_LABELS,
	DATASET_PARAM,
	type DeploymentLayout,
	PRESET_PARAM,
	readCompareDataset,
	resolveCompareState,
	URL_STATE_PARAM,
} from '@filter-enginez/examples-shared/compare-core';
import { COMPARE_PATH, SITE } from '@filter-enginez/examples-shared/verticals';

import { escapeHtml } from '../escapeHtml.js';

/**
 * The format a preset is encoded in.
 *
 * @remarks
 * The apps let a visitor choose a format and remember it per app; this page has no such control and
 * lives on another origin, so it encodes presets in the apps' own default, the readable one, where the
 * serialized state below the controls can be read as JSON. A visitor's own `?f=` is never re-encoded,
 * whatever its format.
 */
export const COMPARE_PRESET_FORMAT: CompareStateOptions['format'] = 'human-readable';

/** The three query parameters the page reads. */
export interface CompareQuery {
	/** Which dataset to compare. */
	readonly dataset: CompareDataset;
	/** A `?f=` the visitor arrived with, or `null`. */
	readonly inboundState: string | null;
	/** The `?preset=` they chose, or `null`. */
	readonly presetId: string | null;
}

/** What a visit with no query shows: the first dataset and its first preset. */
export const COLD_VISIT: CompareQuery = { dataset: COMPARE_DATASETS[0], inboundState: null, presetId: null };

/**
 * Read the page's parameters from a query string.
 *
 * @param search - `location.search`, with or without its leading `?`.
 * @returns The parameters, with the dataset narrowed (an unknown one falls back to the first).
 */
export function readCompareQuery(search: string): CompareQuery {
	const parameters = new URLSearchParams(search);

	return {
		dataset: readCompareDataset(parameters.get(DATASET_PARAM)),
		inboundState: parameters.get(URL_STATE_PARAM),
		presetId: parameters.get(PRESET_PARAM),
	};
}

/**
 * A root-relative link to this page with the given parameters.
 *
 * @remarks
 * Built with `URLSearchParams`, so a preset id or dataset could never break out of the query.
 *
 * @param parameters - The query parameters, in the order they should read.
 * @returns For example `/compare?dataset=books&preset=fiction`.
 */
function comparePageHref(parameters: readonly (readonly [string, string])[]): string {
	return `${COMPARE_PATH}?${new URLSearchParams(parameters.map(([key, value]) => [key, value])).toString()}`;
}

/**
 * One toggle in a control group.
 *
 * @param href - Where it leads.
 * @param label - Its text.
 * @param isSelected - Whether it is the current choice.
 * @param title - An optional tooltip, the preset's description.
 * @returns The toggle's markup.
 */
function renderToggle(href: string, label: string, isSelected: boolean, title?: string): string {
	const className = isSelected ? 'fe-compare__toggle fe-compare__toggle--selected' : 'fe-compare__toggle';
	const current = isSelected ? ' aria-current="true"' : '';
	const tooltip = title === undefined ? '' : ` title="${escapeHtml(title)}"`;

	return `<a class="${className}" href="${escapeHtml(href)}"${current}${tooltip}>${escapeHtml(label)}</a>`;
}

/**
 * A labelled group of toggles.
 *
 * @param label - The group's accessible name.
 * @param toggles - The toggles' markup.
 * @returns The group's markup.
 */
function renderGroup(label: string, toggles: readonly string[]): string {
	return `<div class="fe-compare__group" role="group" aria-label="${escapeHtml(label)}">${toggles.join('')}</div>`;
}

/** The view, ready to place in the page. */
export interface RenderedCompareView {
	/** The page's `<h1>` text. */
	readonly heading: string;
	/** The controls, the state line and the list of apps, as markup. */
	readonly viewHtml: string;
}

/**
 * Render the comparison view for one set of parameters.
 *
 * @param query - The page's parameters.
 * @param location - Where the page is served from, which decides the apps' origins.
 * @param layout - Override the layout the location implies; the build passes `'production'`.
 * @returns The heading and the view's markup.
 */
export function renderCompareView(
	query: CompareQuery,
	location: CompareLocation,
	layout?: DeploymentLayout,
): RenderedCompareView {
	const { dataset, inboundState, presetId } = query;
	const presets = COMPARE_PRESETS[dataset];
	const { serialized, sourceLabel } = resolveCompareState({
		dataset,
		format: COMPARE_PRESET_FORMAT,
		inboundState,
		presetId,
	});
	const links = compareLinks({ dataset, layout, location, serialized });

	const groups = [
		renderGroup(
			'Dataset',
			COMPARE_DATASETS.map((candidate) =>
				renderToggle(comparePageHref([[DATASET_PARAM, candidate]]), DATASET_LABELS[candidate], candidate === dataset),
			),
		),
	];

	// Offering a preset to someone who arrived with a state of their own would replace the very thing
	// they followed the link to see.
	if (inboundState === null) {
		const selectedPresetId = presetId ?? presets[0].id;

		groups.push(
			renderGroup(
				'Example state',
				presets.map((preset) =>
					renderToggle(
						comparePageHref([
							[DATASET_PARAM, dataset],
							[PRESET_PARAM, preset.id],
						]),
						preset.label,
						preset.id === selectedPresetId,
						preset.description,
					),
				),
			),
		);
	}

	const rows = links.map((link) =>
		[
			'<li class="fe-compare__row">',
			'<div class="fe-compare__row-head">',
			`<a class="fe-compare__row-name" href="${escapeHtml(link.href)}">${escapeHtml(link.vertical.name)}</a>`,
			`<span class="fe-compare__row-framework">${escapeHtml(link.vertical.framework)}</span>`,
			'</div>',
			`<p class="fe-compare__row-blurb">${escapeHtml(link.vertical.blurb)}</p>`,
			'<p class="fe-compare__row-binding">',
			`<code>${escapeHtml(link.vertical.binding ?? 'no binding — bare core')}</code>`,
			`<span class="fe-compare__row-surface">${escapeHtml(link.vertical.surface)}</span>`,
			'</p>',
			'</li>',
		].join(''),
	);

	return {
		heading: compareHeading(dataset),
		viewHtml: [
			`<div class="fe-compare__controls">${groups.join('')}</div>`,
			'<div class="fe-compare__state">',
			`<span class="fe-compare__state-label">${escapeHtml(sourceLabel)}</span>`,
			`<code class="fe-compare__state-value">${escapeHtml(serialized)}</code>`,
			'</div>',
			`<ul class="fe-compare__list" aria-label="${escapeHtml(compareListLabel(dataset))}">${rows.join('')}</ul>`,
		].join('\n'),
	};
}

/** The deployed site, as a location, for the build-time render. */
const DEPLOYED_SITE: CompareLocation = {
	hostname: new URL(SITE.productionOrigin).hostname,
	origin: SITE.productionOrigin,
};

/** The marker `compare.html` leaves inside its `<h1>`. */
export const COMPARE_HEADING_SLOT = '<!--compare:heading-->';

/** The marker `compare.html` leaves where the view goes. */
export const COMPARE_VIEW_SLOT = '<!--compare:view-->';

/**
 * Fill `compare.html` with a cold visit to the default dataset, linked to the deployed apps.
 *
 * @param html - The contents of `compare.html`.
 * @returns The HTML with both slots filled.
 * @throws If a slot marker is missing or appears more than once — the page would otherwise build and
 *   ship with nothing to compare.
 */
export function prerenderCompare(html: string): string {
	const { heading, viewHtml } = renderCompareView(COLD_VISIT, DEPLOYED_SITE, 'production');
	let output = html;

	for (const [marker, content] of [
		[COMPARE_HEADING_SLOT, escapeHtml(heading)],
		[COMPARE_VIEW_SLOT, viewHtml],
	] as const) {
		const occurrences = output.split(marker).length - 1;

		if (occurrences !== 1) {
			throw new Error(`compare.html must contain ${marker} exactly once; found ${String(occurrences)}.`);
		}

		// A replacer FUNCTION, so a `$` in the content is never read as a replacement pattern.
		output = output.replace(marker, () => content);
	}

	return output;
}
