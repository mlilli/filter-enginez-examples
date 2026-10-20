/**
 * `<PageErrorScreen />` — what the React apps and the documentation site show when a page cannot be
 * shown: its code did not load, or it threw while rendering.
 *
 * @remarks
 * The markup and words every app renders for this (`../page-error/core.ts`), over the shared
 * `.fe-page-error*` classes. {@link PageErrorBoundary} renders it in place of the routes.
 *
 * @packageDocumentation
 */

import {
	PAGE_ERROR_HINT,
	PAGE_ERROR_HOME_HREF,
	PAGE_ERROR_HOME_LABEL,
	PAGE_ERROR_TITLE,
	pageErrorDetail,
} from '../page-error/core.js';

/** Props for {@link PageErrorScreen}. */
export interface PageErrorScreenProps {
	/** What was thrown; its message is the detail line. */
	readonly error: unknown;
}

/**
 * The page-error screen: one main landmark holding the alert.
 *
 * @param props - The failure.
 * @returns The screen.
 */
export const PageErrorScreen = ({ error }: PageErrorScreenProps): React.ReactElement => (
	<main className="fe-page-error">
		<div className="fe-page-error__card" role="alert">
			<p className="fe-page-error__title">{PAGE_ERROR_TITLE}</p>
			<p className="fe-page-error__detail">{pageErrorDetail(error)}</p>
			<p className="fe-page-error__hint">{PAGE_ERROR_HINT}</p>
			{/* A plain link, not a router link: loading the page again is what recovers from a chunk that did not arrive. */}
			<a className="fe-page-error__link" href={PAGE_ERROR_HOME_HREF}>
				{PAGE_ERROR_HOME_LABEL}
			</a>
		</div>
	</main>
);
