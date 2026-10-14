/**
 * Turning one serialized engine state into one link per vertical that serves the dataset.
 *
 * @remarks
 * This is the whole mechanism the comparison page exists to demonstrate. Every vertical reads the same `f`
 * query param, every vertical reads it with the one `createLinkSerializer` (`../url/linkSerializer.ts`),
 * and that serializer's decode sniffs the `h~` / `c~` / `b~` prefix rather than being told the format —
 * so a value produced by the Angular app decodes unchanged in the framework-less one. This module is
 * what exercises that claim.
 *
 * **"One per vertical that serves it" rather than "six".** Three datasets are served by all six apps
 * and `wine-server` by exactly two.
 *
 * @packageDocumentation
 */

import { type VerticalDescriptor, VERTICALS } from '../verticals/verticals.js';
import { type CompareLocation, type DeploymentLayout, resolveVerticalOrigin } from './origins.js';

/**
 * The datasets the comparison page can reproduce state across.
 *
 * @remarks
 * **Four, and the fourth is deliberately not served by all six.** `wine-server`
 * links exactly two verticals — SvelteKit running the isomorphic core in-process in its own server
 * tier, and vanilla reaching the same core across a process boundary over HTTP. A two-row table is
 * the POINT of that entry, not a gap in it: it is the only place in the repo where two server-tier
 * arrangements of one engine sit side by side under one serialized state.
 *
 * 🔴 **Which verticals serve a dataset is a per-dataset fact, not a universal rule.** Deriving the
 * expected rows per dataset — from the same `routes` array {@link compareLinks} filters on — would
 * restate the implementation and let the very regression the test guards against pass. So
 * `core.test.ts` pins an explicit, hand-written roster of vertical ids per dataset instead. Widening this
 * union means adding a row there, by hand, from the app's actual routes; there is no derivation to
 * lean on, deliberately.
 *
 * Widening it is also a compile error until `DATASET_ROUTES`, `DATASET_LABELS` and
 * `COMPARE_PRESETS` each gain the key, since all three are `Record<CompareDataset, …>`. That is the
 * type doing the work a checklist would otherwise have to.
 */
export type CompareDataset = 'books' | 'real-estate' | 'wine-server' | 'wine';

/**
 * Every dataset, in the order the toggle presents them.
 *
 * @remarks
 * Typed as a NON-EMPTY array rather than `readonly CompareDataset[]`, which is not a style choice.
 * `noUncheckedIndexedAccess` types `COMPARE_DATASETS[0]` as possibly `undefined`, so
 * {@link readCompareDataset}'s fallback would need a second `??` arm that no test could ever reach —
 * and an unreachable branch is a 100%-coverage failure that only the coverage gate can see, which is
 * the one gate a plain `pnpm test` does not exercise. Encoding "there is always at least one
 * dataset" in the type removes the branch instead of suppressing it. A tuple is assignable to
 * `readonly CompareDataset[]`, so nothing downstream notices.
 */
export const COMPARE_DATASETS: readonly [CompareDataset, ...CompareDataset[]] = [
	'books',
	'wine',
	'wine-server',
	'real-estate',
];

/**
 * Where each dataset lives.
 *
 * @remarks
 * The match is on the EXACT route string against each vertical's declared `routes`, which is what
 * makes `wine` and `wine-server` two entries rather than one with a variant: `/wine` is served by
 * all six, `/wine-server` by two, and a single entry could only ever describe one of those. Listing
 * `/wine-server` drops four verticals from its table, which is the designed behavior of a separate
 * dataset.
 */
export const DATASET_ROUTES: Readonly<Record<CompareDataset, string>> = {
	books: '/books',
	'real-estate': '/real-estate',
	wine: '/wine',
	'wine-server': '/wine-server',
};

/** Human label for a dataset, for the toggle and the page heading. */
export const DATASET_LABELS: Readonly<Record<CompareDataset, string>> = {
	books: 'Books',
	'real-estate': 'Real estate',
	wine: 'Wine reviews',
	// The middot separator is the house convention for a tier qualifier — `verticalSubtitle` paints
	// `Wine · Vanilla · server` from the same parts. It reads as a sibling of `Wine reviews` in the
	// toggle rather than as an unrelated fourth dataset, which is what the two entries are.
	'wine-server': 'Wine · server tier',
};

/** One vertical's row on the comparison page. */
export interface CompareLink {
	/** The full URL, with the state already in its `f` param. */
	readonly href: string;
	/** The route this link lands on, e.g. `/books`. */
	readonly route: string;
	/** Everything the comparison table renders — framework, binding, surface, blurb. */
	readonly vertical: VerticalDescriptor;
}

/** Inputs to {@link compareLinks}. */
export interface CompareLinkOptions {
	/** Which dataset the links should open. */
	readonly dataset: CompareDataset;
	/** Override the detected deployment layout. Tests and previews only. */
	readonly layout?: DeploymentLayout;
	/** Where the page is currently served from. */
	readonly location: CompareLocation;
	/** A tagged, serialized `FilterEngineConfig` — the value that goes in `?f=`. */
	readonly serialized: string;
}

/** The query parameter every vertical reads its state from. */
export const URL_STATE_PARAM = 'f';

/**
 * Query param naming which dataset the comparison table is showing.
 *
 * @remarks
 * Here rather than in the page, together with {@link PRESET_PARAM} and {@link readCompareDataset},
 * because two sides of the contract read it: the comparison page on the landing site, and the header
 * Compare button in every app, which writes it. One shared definition beats restating the query
 * contract on each side.
 *
 * It matters more than the usual DRY argument, too. A side that spelled these differently would not
 * fail: it would produce a comparison page that silently opens on the default dataset, which reads as
 * a UI bug several layers from the typo that caused it.
 */
export const DATASET_PARAM = 'dataset';

/** Query param naming the selected preset, so a chosen state is itself linkable. */
export const PRESET_PARAM = 'preset';

/**
 * Whether a `?f=` value is actually state, as opposed to a parameter that happens to be present.
 *
 * @remarks
 * Two arms, one meaning, needed in six places: once in `resolveCompareState`, and once in the header
 * Compare button in each of the five framework idioms. One definition keeps them agreeing.
 *
 * The distinction it encodes is not pedantry. **`?f=` present but blank is what a trimmed or
 * half-copied link produces** — a chat client clipping the tail, a visitor selecting up to the
 * `=` — and it arrives looking exactly like state. Treating it as state transports nothing while
 * reporting that it transported the visitor's own filters, which is the failure this module guards
 * against throughout. Both callers must agree on the answer or the Compare button offers itself as
 * enabled and then lands on a preset.
 *
 * @param serialized - The raw `?f=` value, or `null` when the param is absent.
 * @returns `true` when there is something worth carrying.
 */
export function hasComparableState(serialized: string | null): serialized is string {
	return serialized !== null && serialized !== '';
}

/**
 * Narrow an arbitrary query value to a dataset.
 *
 * @remarks
 * Falls back rather than throwing: the input is a URL someone may have typed, bookmarked before a
 * dataset was renamed, or had mangled by a chat client, and none of those deserve an error page on a
 * demo. The fallback is the first entry of {@link COMPARE_DATASETS} rather than a repeated `'books'`
 * literal, so reordering the toggle also moves the default and cannot leave the two disagreeing.
 *
 * @param raw - The raw query value, or `null` when the param is absent.
 * @returns The matching dataset, or the first one.
 */
export function readCompareDataset(raw: string | null): CompareDataset {
	return COMPARE_DATASETS.find((dataset) => dataset === raw) ?? COMPARE_DATASETS[0];
}

/**
 * The verticals that actually serve a dataset's route, in the registry's presentation order.
 *
 * @remarks
 * Exactly the filter {@link compareLinks} applies, lifted out because other callers need the same
 * answer: the copy that states a row count, and the e2e specs that assert one. A hardcoded
 * `VERTICALS.length` would be correct for three datasets and silently wrong for `wine-server`.
 *
 * 🔴 **Not for `core.test.ts`, and the omission is the point.** That suite's job is to catch a
 * vertical quietly dropping a route from its registry entry, and it can only do that while its
 * expectation comes from somewhere this function does not read. Pointing it here would restate the
 * implementation and let the regression pass. It pins a hand-written roster instead. The e2e specs
 * are a different pair — they compare a RENDERED page against the registry, so deriving the
 * expected set here is what lets them catch a shell rendering the wrong rows.
 *
 * @param dataset - The dataset whose route to match.
 * @returns The serving verticals, possibly fewer than all six, in presentation order.
 */
export function verticalsServing(dataset: CompareDataset): readonly VerticalDescriptor[] {
	const route = DATASET_ROUTES[dataset];

	return VERTICALS.filter((descriptor) => descriptor.routes.includes(route));
}

/**
 * Build one link per vertical for the given dataset and state.
 *
 * @remarks
 * **The `URL` construction is load-bearing, not stylistic.** The `human-readable` format is plain
 * `JSON.stringify` — braces, quotes and commas — and `serializers.ts` deliberately does not
 * percent-encode it, on the grounds that "the transport does the single encode". Every writer in the
 * repo honors that by going through `searchParams.set`. Concatenating the serialized value into an
 * href by hand would produce a malformed URL for two of the three formats, and would do it only for
 * the readable one that a human is most likely to be looking at when they notice.
 *
 * Verticals that do not serve the dataset's route are dropped rather than linked into a 404 — see
 * {@link verticalsServing}. For the three browser datasets that removes nothing, and for
 * `wine-server` it removes four **by design**. `core.test.ts` pins the resulting roster per dataset
 * against a hand-written list, so a vertical dropping a route fails as a gate rather than as a
 * quietly shorter table.
 *
 * @param options - See {@link CompareLinkOptions}.
 * @returns One entry per vertical serving the dataset, in the registry's presentation order.
 */
export function compareLinks(options: CompareLinkOptions): readonly CompareLink[] {
	const { dataset, layout, location, serialized } = options;
	const route = DATASET_ROUTES[dataset];

	return verticalsServing(dataset).map((descriptor) => {
		const url = new URL(`${resolveVerticalOrigin(descriptor.id, location, layout)}${route}`);

		url.searchParams.set(URL_STATE_PARAM, serialized);

		return {
			href: url.toString(),
			route,
			vertical: descriptor,
		};
	});
}
