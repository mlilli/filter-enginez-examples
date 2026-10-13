/**
 * The other direction: from a dataset route TO `/compare`, carrying the state the visitor built.
 *
 * @remarks
 * `links.ts` answers "given a state, where does each of the six serve this dataset?". This module
 * answers the question that comes first — "I am on `/books` with filters applied; what URL takes
 * that state to the comparison page?". It is the header **Compare** button's entire logic, and it
 * lives here because sixteen call sites across five framework idioms cannot each build a URL and
 * stay in agreement.
 *
 * ### It is NOT a root-relative `/compare`
 *
 * The obvious implementation — `href="/compare?f=…"` — works in development and breaks in
 * production, which is the worst arrangement available. Under the `paths` layout (`PRODUCTION_LAYOUT`
 * in `origins.ts`) each vertical is served under `${origin}/${id}`, so a root-relative link leaves
 * the app entirely and 404s. Going through {@link resolveVerticalOrigin} costs one call and makes the two
 * layouts a decision made once, in one place, rather than a bug waiting in every production deploy.
 *
 * ### The state comes from the URL WRITER, not from a re-read of the address bar
 *
 * Every vertical mirrors engine state into `?f=` on a 150 ms debounce, and four of the six do it
 * with a bare `history.replaceState` — which fires no event, so nothing observes the parameter
 * arriving. A button that read `window.location.search` when clicked could therefore fire inside
 * that debounce window, find nothing, and land the visitor on `/compare` with a **preset**: their
 * real filters silently swapped for a plausible substitute. Hence {@link CompareTargetOptions.serialized}
 * is an input rather than something this module reads. Each shell passes the value its URL sync
 * last wrote, which is both reactive and race-free, and is byte-identical to the address bar by
 * construction rather than by timing.
 *
 * @packageDocumentation
 */

import { type VerticalId } from '../verticals/verticals.js';
import {
	type CompareDataset,
	DATASET_PARAM,
	hasComparableState,
	URL_STATE_PARAM,
} from './links.js';
import { type CompareLocation, type DeploymentLayout, resolveVerticalOrigin } from './origins.js';

/**
 * Where the comparison page lives, in every vertical.
 *
 * @remarks
 * The six framework route tables keep their own `'/compare'` literal, which is not duplication —
 * a route table declaring the path it serves IS the framework's contract. This constant is for the
 * code that has to NAME that path from the outside, such as the vanilla shell and the cross-shell
 * e2e spec.
 */
export const COMPARE_ROUTE = '/compare';

/**
 * The header button's label. One string, so sixteen call sites cannot drift into fifteen synonyms.
 *
 * @remarks
 * A constant, unlike `compareButtonTitle` and `compareEmptyHint` in `copy.ts`, which are functions
 * of the dataset: "Compare" says nothing about how many apps it reaches, so no dataset can make it
 * false.
 */
export const COMPARE_BUTTON_LABEL = 'Compare';

/** Inputs to {@link compareTargetHref}. */
export interface CompareTargetOptions {
	/** The vertical doing the linking. Its OWN `/compare` is the destination, not another app's. */
	readonly currentVerticalId: VerticalId;
	/** Which dataset the visitor is filtering. */
	readonly dataset: CompareDataset;
	/** Override the detected deployment layout. Tests and previews only. */
	readonly layout?: DeploymentLayout;
	/** Where the page is currently served from. */
	readonly location: CompareLocation;
	/**
	 * The value currently in `?f=`, or `null` when the visitor has not filtered anything yet.
	 *
	 * @remarks
	 * Empty and `null` mean the same thing here — see {@link hasComparableState}. Both produce a
	 * bare `/compare?dataset=…`, which is a working page showing a preset, not an error.
	 */
	readonly serialized: string | null;
}

/**
 * Build the URL the header **Compare** button points at.
 *
 * @remarks
 * `dataset` is set BEFORE `f` so the short, human-meaningful parameter reads first and the long
 * serialized blob trails — the readable format puts raw JSON in that value, and a visitor glancing
 * at their address bar should not have to scroll past it to see which dataset they are comparing.
 *
 * The state goes through `searchParams.set` rather than into a template literal, for the reason
 * `compareLinks` records at length in `links.ts`: the readable format is un-encoded JSON by design, so
 * hand-building the query produces a malformed URL for exactly the format a human is most likely
 * to be looking at when it breaks.
 *
 * No check that the current vertical actually serves {@link COMPARE_ROUTE}: all six do, the
 * registry says so, and a guard against it would be a branch no test could reach — which fails the
 * 100%-coverage gate, the one gate a plain `pnpm test` does not exercise. `core.test.ts` asserts
 * the registry-level fact instead, where a regression fails loudly.
 *
 * @param options - See {@link CompareTargetOptions}.
 * @returns An absolute URL to this vertical's own `/compare`, carrying the state when there is one.
 */
export function compareTargetHref(options: CompareTargetOptions): string {
	const { currentVerticalId, dataset, layout, location, serialized } = options;
	const url = new URL(`${resolveVerticalOrigin(currentVerticalId, location, layout)}${COMPARE_ROUTE}`);

	url.searchParams.set(DATASET_PARAM, dataset);

	if (hasComparableState(serialized)) {
		url.searchParams.set(URL_STATE_PARAM, serialized);
	}

	return url.toString();
}
