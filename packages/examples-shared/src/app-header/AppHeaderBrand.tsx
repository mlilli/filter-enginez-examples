/**
 * `<AppHeaderBrand>` — the React half of the header every page of every demo app carries.
 *
 * @remarks
 * The logomark and the `FILTER ENGINEZ` wordmark link home to the landing site; the subtitle names
 * the page and the app, and the app's name links back to this app's dataset hub; "All demos" links
 * to the landing page's list of every demo, and `ui-styles` shows it from the `lg` breakpoint up, so
 * on phones and tablets the logomark alone carries the way home and the header never overflows.
 * Strings and URLs come from `./core.ts`, the same module the four non-React apps render from.
 *
 * ### One link per destination, as far as assistive technology can tell
 *
 * The logomark is the home link. The wordmark beside it links to the same place for pointer users, so
 * the whole brand is a target, but is taken out of the tab order and the accessibility tree: a
 * keyboard or screen-reader user meets ONE home link, not two in a row with the same name.
 *
 * @packageDocumentation
 */

import { Mark } from '@filter-enginez/brand';
import { use } from 'react';
import { NavLink } from 'react-router';

import { type EngineTier, type VerticalId } from '../verticals/verticals.js';
import { AppVerticalContext } from './appVerticalContext.js';
import {
	ALL_DEMOS_LABEL,
	appHeaderLinks,
	appHeaderSubtitle,
	BRAND_NAV_LABEL,
	SITE_HOME_LABEL,
} from './core.js';

/** Props for {@link AppHeaderBrand}. */
export interface AppHeaderBrandProps {
	/** The dataset or page the header belongs to, e.g. `Wine` or a `HEADER_PAGE_LABELS` entry. */
	readonly page: string;
	/** The engine tier the route runs, when its subtitle names one. */
	readonly tier?: EngineTier;
	/** The app rendering the page. Defaults to the one {@link AppVerticalContext} provides. */
	readonly verticalId?: VerticalId;
}

/**
 * The header's brand: home link, wordmark, subtitle with the hub link, and "All demos".
 *
 * @param props - See {@link AppHeaderBrandProps}.
 * @returns A `<nav>` for the left of a header.
 */
export const AppHeaderBrand = (props: AppHeaderBrandProps): React.ReactElement => {
	const { page, tier } = props;
	const providedVerticalId = use(AppVerticalContext);
	const verticalId = props.verticalId ?? providedVerticalId;
	// Only `hostname` and `origin` are read, and neither changes within a session.
	const { allDemosHref, homeHref } = appHeaderLinks(window.location);
	const subtitle = appHeaderSubtitle(page, verticalId, tier);

	return (
		<nav className="fe-books-app__brand" aria-label={BRAND_NAV_LABEL}>
			<a className="fe-books-app__home" href={homeHref} aria-label={SITE_HOME_LABEL}>
				<Mark size={36} animated className="fe-books-app__mark" />
			</a>
			<span className="fe-books-app__wordmark">
				<a className="fe-books-app__name" href={homeHref} tabIndex={-1} aria-hidden="true">
					Filter EngineZ
				</a>
				<span className="fe-books-app__subtitle">
					{subtitle.lead}
					{subtitle.hub === null ? null : (
						<NavLink className="fe-books-app__hub" to={subtitle.hub.href} end aria-label={subtitle.hub.label}>
							{subtitle.hub.text}
						</NavLink>
					)}
					{subtitle.trail}
				</span>
			</span>
			<a className="fe-books-app__nav-link fe-books-app__all-demos" href={allDemosHref}>
				{ALL_DEMOS_LABEL}
			</a>
		</nav>
	);
};
