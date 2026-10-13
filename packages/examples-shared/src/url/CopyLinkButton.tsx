/**
 * `<CopyLinkButton>` — copies the current page URL to the clipboard, with brief "Copied!" feedback.
 *
 * @remarks
 * A dataset-agnostic shell affordance for the URL-state-enabled routes: because `<FilterEngineUrlSync>`
 * keeps the live filter state encoded in the address bar, the current URL IS a shareable link to the
 * exact filter state — this button just copies it. Browser-only (uses `navigator.clipboard` +
 * `window.location`), so it lives in examples-shared rather than react-ui (which forbids browser
 * globals). Cyan-accented per the design system: sharing a filter state is a data/identity affordance.
 *
 * ### Styled by `.fe-copy-link`, not by an inline object
 *
 * Its look comes from the shared `ui-styles` class the four non-React verticals use too. Both React
 * apps `@import` that sheet globally, so an inline `style` copy of the same properties would buy
 * nothing and could change independently; `<CompareLinkButton>` uses the same shared class. The
 * transition is `opacity` and the `:hover` state is `opacity: 0.82`, identical in every vertical.
 *
 * @packageDocumentation
 */

import { useCallback, useRef, useState } from 'react';

/** How long the "Copied!" confirmation stays up before reverting to "Copy link". */
const COPIED_FEEDBACK_MS = 1600;

/**
 * A "Copy link" button for the URL-state-enabled dataset shells.
 */
export const CopyLinkButton = (): React.ReactElement => {
	const [isCopied, setIsCopied] = useState(false);
	const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const handleCopy = useCallback((): void => {
		// Clipboard write can reject (permissions / insecure context); on failure we no-op — the URL
		// is still in the address bar for manual copy.
		void navigator.clipboard.writeText(window.location.href).then(
			() => {
				setIsCopied(true);
				if (resetTimerRef.current !== null) {
					clearTimeout(resetTimerRef.current);
				}
				resetTimerRef.current = setTimeout(() => setIsCopied(false), COPIED_FEEDBACK_MS);
			},
			() => undefined,
		);
	}, []);

	return (
		<button
			type="button"
			onClick={handleCopy}
			aria-live="polite"
			className="fe-copy-link"
		>
			<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
				<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
				<path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
			</svg>
			{isCopied ? 'Copied!' : 'Copy link'}
		</button>
	);
};
