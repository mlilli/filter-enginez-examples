/**
 * `<CompareLinkButton>` — takes the filter state you are looking at to the `/compare` page.
 *
 * @remarks
 * The header affordance beside Copy link, and the entry point to the cross-app comparison: Copy
 * link hands the state to another PERSON, this hands it to another APP. Every decision it makes
 * comes from `@filter-enginez/examples-shared/compare-core`, so the four non-React shells' own
 * compare buttons contribute framework idiom and nothing else.
 *
 * ### Why the state comes from `useSearchParams` and not `window.location`
 *
 * They differ, and the difference has teeth. `<FilterEngineUrlSync>` writes through react-router's
 * `navigate()`, so the router's search is the value that re-renders this component — a
 * `window.location.search` read would be correct only until the first filter change, then silently
 * stale. The four hand-rolled shells have the mirror-image problem (they write with
 * `history.replaceState`, which fires no event at all), which is why `compareTargetHref` takes the
 * serialized value as an argument rather than reading a global: each shell knows where its own
 * truth lives, and only React's happens to be a hook.
 *
 * ### The empty state is `aria-disabled`, not `disabled`
 *
 * Anchors do not honor `disabled`, and applying it would drop the control out of the tab order —
 * leaving a visible affordance a keyboard user cannot reach to discover why it does nothing. It
 * stays focusable, the click is refused in script, and the accessible NAME becomes the reason
 * (`compareEmptyHint(dataset)`) rather than the action. Announcing "Compare, dimmed" says less than
 * announcing what would make it work.
 *
 * @packageDocumentation
 */

import { useCallback } from 'react';
import { useSearchParams } from 'react-router';

import {
	COMPARE_BUTTON_LABEL,
	compareButtonTitle,
	type CompareDataset,
	compareEmptyHint,
	compareTargetHref,
	hasComparableState,
	URL_STATE_PARAM,
} from '../compare/core.js';
import { type VerticalId } from '../verticals/verticals.js';

/** Props for {@link CompareLinkButton}. */
export interface CompareLinkButtonProps {
	/** Which dataset this route filters — the dataset `/compare` should open on. */
	readonly dataset: CompareDataset;
	/** Which app is rendering. The destination is THIS vertical's `/compare`, not another's. */
	readonly verticalId: VerticalId;
}

/**
 * A "Compare" link for the URL-state-enabled dataset shells.
 *
 * @param props - See {@link CompareLinkButtonProps}.
 * @returns The link, inert until the visitor has filtered something.
 */
export const CompareLinkButton = (props: CompareLinkButtonProps): React.ReactElement => {
	const { dataset, verticalId } = props;
	const [searchParams] = useSearchParams();

	const serialized = searchParams.get(URL_STATE_PARAM);
	const isComparable = hasComparableState(serialized);
	const href = compareTargetHref({
		currentVerticalId: verticalId,
		dataset,
		// Only `hostname` and `origin` are read, and neither changes within a session — so this is a
		// constant, not the mutable state the search params are.
		location: window.location,
		serialized,
	});

	const handleClick = useCallback(
		(event: React.MouseEvent<HTMLAnchorElement>): void => {
			if (!isComparable) {
				event.preventDefault();
			}
		},
		[isComparable],
	);

	const description = isComparable ? compareButtonTitle(dataset) : compareEmptyHint(dataset);

	return (
		<a
			href={href}
			onClick={handleClick}
			aria-disabled={isComparable ? undefined : true}
			aria-label={description}
			title={description}
			className="fe-compare-link"
		>
			<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
				<path d="M3 9h15" />
				<path d="M15 6l3 3-3 3" />
				<path d="M21 15H6" />
				<path d="M9 18l-3-3 3-3" />
			</svg>
			{COMPARE_BUTTON_LABEL}
		</a>
	);
};
