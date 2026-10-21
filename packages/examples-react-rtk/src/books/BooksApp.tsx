/**
 * `<BooksApp />` — the books page shell. Mobile-first: a single stacked column on small
 * viewports (filters behind a "Filters" disclosure), promoting to a two-column layout (static filter
 * sidebar + result grid) at the `lg` breakpoint and up.
 *
 * @remarks
 * Structurally the wine shell's leaner sibling — the same mobile-first sidebar card via react-ui's
 * `<FilterCollapse />` (a "Filters" disclosure below `lg`, decided by `useIsDesktop()`; the one
 * `<BooksFilterPanel />` is hidden rather than unmounted, so there are no duplicate engine
 * subscriptions and no lost local state) and the same "result count + computing pill + active-filter
 * chips live in `<BooksResultsHeader />` above the grid" arrangement. It carries the same header controls as wine
 * (undo / redo / devtools toggle via the shared `<TimeTravelControls />`, plus the URL controls)
 * and the shared inline `<DevtoolsPanel />`.
 *
 * @packageDocumentation
 */

import { AppHeaderBrand } from '@filter-enginez/examples-shared/app-header';
import { BooksFilterPanel, BooksResultGrid, captureCurrentVersion, markResolvedAtLeast, markUserAction, useIsEngineBusy } from '@filter-enginez/examples-shared/books';
import { DevtoolsPanel, TimeTravelControls } from '@filter-enginez/examples-shared/devtools';
import { CompareLinkButton, CopyLinkButton, UrlFormatToggle } from '@filter-enginez/examples-shared/url';
import { type EngineTier } from '@filter-enginez/examples-shared/verticals';
import { useIsDesktop } from '@filter-enginez/examples-shared/viewport';
import { useLastChange } from '@filter-enginez/react-signals';
import { FilterCollapse } from '@filter-enginez/react-ui';
import { useEffect, useState } from 'react';

import { BooksResultsHeader } from './BooksResultsHeader.js';
import { useBooksSelector } from './store.js';

/**
 * Props for {@link BooksApp}.
 */
export interface BooksAppProps {
	/** Footer engine label — where filtering runs. Defaults to `main-thread engine`. */
	readonly engineLabel?: string;
	/**
	 * The engine tier the header subtitle names, e.g. `server`. Omitted for the in-browser engine, whose
	 * subtitle names the dataset and the app alone.
	 */
	readonly tier?: EngineTier;
}

/**
 * The books page shell.
 */
export const BooksApp = (props: BooksAppProps = {}): React.ReactElement => {
	// Optional rather than required: `/books` is the ordinary case and should not have to say so.
	// `/books-server` renders this EXACT component over an HTTP-backed engine, and the header is the
	// only place a visitor can tell which one they are looking at (the footer's engine label agrees).
	const { engineLabel = 'main-thread engine', tier } = props;
	// Two-column breakpoint switch — `true` at ≥1024px (static sidebar), `false` below (the sidebar
	// card collapses behind its "Filters" button).
	const isDesktop = useIsDesktop();
	// Devtools panel visibility — toggled by the `>_` icon in the header. Default hidden: it is a
	// developer surface, and an open timeline is the first thing to push the results below the fold.
	const [isDevtoolsVisible, setIsDevtoolsVisible] = useState(false);
	const isEngineBusy = useIsEngineBusy();
	// Resolve the engine-busy tracker on every settle. Wine clears the "computing" state as a
	// side-effect of its per-change bundle fetch (`markResolvedAtLeast` in `filterBundle`); books has
	// no bundle, so without this the tracker's `userActionVersion` (bumped by `markUserAction`) would
	// never be caught by `resolvedVersion` and the indicator would stick on forever. The engine is
	// main-thread + synchronous here, so a settle is simply the next `lastChange` snapshot: advancing
	// the resolved version to the current user-action version there clears the indicator a frame after
	// the recompute lands.
	const lastChange = useLastChange();

	useEffect(() => {
		markResolvedAtLeast(captureCurrentVersion());
	}, [lastChange]);

	return (
		<div className="min-h-screen flex flex-col">
			<Header
				tier={tier}
				controlSizePx={isDesktop ? 36 : 44}
				isDevtoolsOpen={isDevtoolsVisible}
				onToggleDevtools={() => setIsDevtoolsVisible((visible) => !visible)}
			/>
			{/* Base: single stacked column. `lg:` promotes to the two-column sidebar + grid row. */}
			<main className="flex-1 flex flex-col lg:flex-row gap-4 lg:gap-6 px-4 py-3 lg:px-6 lg:py-4 max-w-[1600px] w-full mx-auto">
				{/* The filter sidebar card — sticky at `lg`+, a "Filters" disclosure below it. */}
				<FilterCollapse isCollapsible={!isDesktop}>
					<BooksFilterPanel />
				</FilterCollapse>
				<section className="flex-1 min-w-0 flex flex-col gap-4">
					<BooksResultsHeader />
					{/* The action log + time-travel timeline. An inline card in the document flow (no
					    overlay, no slide) so it pushes the grid down rather than covering it — you are
					    usually scrubbing the timeline to watch the RESULTS change. */}
					<DevtoolsPanel
						isComputing={isEngineBusy}
						markBusy={markUserAction}
						onClose={() => setIsDevtoolsVisible(false)}
						open={isDevtoolsVisible}
					/>
					<BooksResultGrid />
				</section>
			</main>
			<Footer engineLabel={engineLabel} />
		</div>
	);
};

/**
 * Page header — the shared header brand (the way home, back to this app's hub, and to every other
 * demo) beside the page's controls.
 *
 * @internal
 */
const Header = (props: {
	readonly controlSizePx: number;
	readonly isDevtoolsOpen: boolean;
	readonly onToggleDevtools: () => void;
	readonly tier: EngineTier | undefined;
}): React.ReactElement => {
	const { controlSizePx, isDevtoolsOpen, onToggleDevtools, tier } = props;

	return (
		<header
			className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 lg:px-6 lg:py-4"
			style={{ background: 'var(--gray-0)', borderBottom: '1px solid var(--gray-3)' }}
		>
			<AppHeaderBrand page="Books" tier={tier} verticalId="react-rtk" />
			<div className="flex flex-wrap items-center justify-end gap-2">
				<TimeTravelControls
					controlSizePx={controlSizePx}
					isDevtoolsOpen={isDevtoolsOpen}
					markBusy={markUserAction}
					onToggleDevtools={onToggleDevtools}
				/>
				<UrlFormatToggle />
				<CopyLinkButton />
				<CompareLinkButton dataset="books" />
			</div>
		</header>
	);
};

/**
 * Footer — small meta line. Reads the engine mode from the Redux mirror (proving `state.filters.mode`
 * is live + selector-readable, same as the wine footer).
 *
 * @internal
 */
const Footer = (props: { readonly engineLabel: string }): React.ReactElement => {
	const { engineLabel } = props;
	const mode = useBooksSelector((state) => state.filters.mode);

	return (
		<footer
			className="text-xs px-4 py-3 lg:px-6 mt-auto"
			style={{
				background: 'var(--gray-0)',
				borderTop: '1px solid var(--gray-3)',
				color: 'var(--gray-8)',
				fontFamily: 'var(--font-mono)',
				letterSpacing: '0.08em',
			}}
		>
			<div className="max-w-[1600px] mx-auto flex flex-col gap-1 lg:flex-row lg:justify-between">
				<span>filter-enginez · books demo · {engineLabel}</span>
				<span>
					engine mode <code style={{ color: 'var(--accent)' }}>{mode}</code>
					{' '}· data via <code style={{ color: 'var(--accent)' }}>@filter-enginez/mock-data</code>
				</span>
			</div>
		</footer>
	);
};
