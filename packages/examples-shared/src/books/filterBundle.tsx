/**
 * `filterBundle.tsx` — the books panel's view onto the shared predictive-disable plumbing.
 *
 * @remarks
 * The implementation lives in [`../filter-bundle`](../filter-bundle/index.tsx), shared with the
 * real-estate panel — none of it is books-specific, since the bundle query names the rule ids and
 * fields and everything downstream is generic. That module's docblock explains the sync-vs-async
 * engine split and what cannot be expressed as a bundle candidate.
 *
 * This file is the books-flavored surface: `BookFilterSections` imports these names. New datasets
 * should import the generic names from `../filter-bundle` directly rather than adding another
 * aliasing layer like this one.
 *
 * @packageDocumentation
 */

export {
	FilterBundleContext as BooksBundleContext,
	type FilterBundleValue as BooksBundleValue,
	useChipExclusion as useBooksChipExclusion,
	useFieldBounds as useBooksFieldBounds,
	useFieldHistogram as useBooksFieldHistogram,
	useFetchFilterBundle as useFetchBooksBundle,
	useToggleWouldBeEmpty,
} from '../filter-bundle/index.js';
