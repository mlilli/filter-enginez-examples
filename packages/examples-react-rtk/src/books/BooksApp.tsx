/**
 * `<BooksApp />` — the books page shell. Mobile-first: a single stacked column on small
 * viewports (filters behind an off-canvas drawer), promoting to a two-column layout (static filter
 * sidebar + result grid) at the `lg` breakpoint and up.
 *
 * @remarks
 * Structurally the wine shell's leaner sibling — same mobile-first sidebar/drawer switch via
 * `useIsDesktop()` (exactly one `<BooksFilterPanel />` mounts, so there are no duplicate engine
 * subscriptions) and the same "result count + computing pill + active-filter chips live in
 * `<BooksResultsHeader />` above the grid" arrangement. It carries the same header controls as wine
 * (undo / redo / devtools toggle via the shared `<TimeTravelControls />`, plus the URL controls)
 * and the shared inline `<DevtoolsPanel />`.
 *
 * @packageDocumentation
 */

import { Mark } from '@filter-enginez/brand';
import { BooksFilterPanel, BooksResultGrid, captureCurrentVersion, markResolvedAtLeast, markUserAction, useIsEngineBusy } from '@filter-enginez/examples-shared/books';
import { DevtoolsPanel, TimeTravelControls } from '@filter-enginez/examples-shared/devtools';
import { CompareLinkButton, CopyLinkButton, UrlFormatToggle } from '@filter-enginez/examples-shared/url';
import { verticalSubtitle } from '@filter-enginez/examples-shared/verticals';
import { useIsDesktop } from '@filter-enginez/examples-shared/viewport';
import { useLastChange } from '@filter-enginez/react-signals';
import { FilterDrawer } from '@filter-enginez/react-ui';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';

import { BooksResultsHeader } from './BooksResultsHeader.js';
import { useBooksSelector } from './store.js';

/**
 * Props for {@link BooksApp}.
 */
export interface BooksAppProps {
	/** Footer engine label — where filtering runs. Defaults to `main-thread engine`. */
	readonly engineLabel?: string;
	/** Header subtitle — names the dataset and the stack. Defaults to the in-browser engine's label. */
	readonly subtitle?: string;
}

/**
 * The books page shell.
 */
export const BooksApp = (props: BooksAppProps = {}): React.ReactElement => {
	// Defaulted rather than required: `/books` is the ordinary case and should not have to say so.
	// `/books-server` renders this EXACT component over an HTTP-backed engine, and the header is the
	// only place a visitor can tell which one they are looking at (the footer's engine label agrees).
	const { engineLabel = 'main-thread engine', subtitle = verticalSubtitle('Books', 'react-rtk') } = props;
	// Mobile filter-drawer visibility — only meaningful below `lg`, where the sidebar collapses.
	const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
	// Two-column breakpoint switch — `true` at ≥1024px (static sidebar), `false` below (drawer).
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
				subtitle={subtitle}
				controlSizePx={isDesktop ? 36 : 44}
				isDevtoolsOpen={isDevtoolsVisible}
				onToggleDevtools={() => setIsDevtoolsVisible((visible) => !visible)}
			/>
			{/* Base: single stacked column. `lg:` promotes to the two-column sidebar + grid row. */}
			<main className="flex-1 flex flex-col lg:flex-row gap-4 lg:gap-6 px-4 py-3 lg:px-6 lg:py-4 max-w-[1600px] w-full mx-auto">
				{isDesktop ? (
					<aside
						className="w-80 shrink-0 sticky top-4 self-start flex flex-col"
						style={{
							background: 'var(--gray-1)',
							border: '1px solid var(--gray-3)',
							borderRadius: 'var(--radius-lg)',
							maxHeight: 'calc(100vh - 2rem)',
						}}
					>
						<BooksFilterPanel />
					</aside>
				) : (
					<FilterDrawer
						isOpen={isFilterDrawerOpen}
						onClose={() => setIsFilterDrawerOpen(false)}
						title="Filters"
						ariaLabel="Book filters"
						keepMounted
					>
						<BooksFilterPanel isHeaderVisible={false} />
					</FilterDrawer>
				)}
				<section className="flex-1 min-w-0 flex flex-col gap-4">
					{!isDesktop ? <FiltersTrigger onOpen={() => setIsFilterDrawerOpen(true)} /> : null}
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
 * Mobile "Filters" trigger — a 44px-tall button that opens the off-canvas filter drawer. Rendered
 * only below `lg` (where the static sidebar is hidden).
 *
 * @internal
 */
const FiltersTrigger = (props: { readonly onOpen: () => void }): React.ReactElement => {
	return (
		<button
			type="button"
			onClick={props.onOpen}
			className="inline-flex items-center justify-center gap-2 self-start text-sm font-medium uppercase transition-colors"
			style={{
				background: 'var(--gray-1)',
				border: '1px solid var(--gray-4)',
				borderRadius: 'var(--radius-md)',
				color: 'var(--gray-10)',
				cursor: 'pointer',
				fontFamily: 'var(--font-display)',
				letterSpacing: '0.08em',
				minHeight: '44px',
				padding: '0 16px',
			}}
		>
			<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
				<path d="M3 5h18M6 12h12M10 19h4" />
			</svg>
			Filters
		</button>
	);
};

/**
 * Page header — brand identity (mark + wordmark), a link back to the dataset hub.
 *
 * @internal
 */
const Header = (props: {
	readonly controlSizePx: number;
	readonly isDevtoolsOpen: boolean;
	readonly onToggleDevtools: () => void;
	readonly subtitle: string;
}): React.ReactElement => {
	const { controlSizePx, isDevtoolsOpen, onToggleDevtools, subtitle } = props;

	return (
		<header
			className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 lg:px-6 lg:py-4"
			style={{ background: 'var(--gray-0)', borderBottom: '1px solid var(--gray-3)' }}
		>
			<Link
				to="/"
				className="flex items-center gap-3 min-w-0"
				style={{ textDecoration: 'none' }}
				aria-label="Filter EngineZ — back to the dataset hub"
			>
				<Mark size={36} animated />
				<div className="hidden min-[360px]:flex flex-col leading-tight">
					<span
						className="text-base font-semibold tracking-wider uppercase"
						style={{ color: 'var(--gray-11)', fontFamily: 'var(--font-display)', letterSpacing: '0.14em' }}
					>
						Filter EngineZ
					</span>
					<span
						className="text-xs uppercase"
						style={{ color: 'var(--gray-8)', fontFamily: 'var(--font-mono)', letterSpacing: '0.12em' }}
					>
						{subtitle}
					</span>
				</div>
			</Link>
			<div className="flex flex-wrap items-center justify-end gap-2">
				<TimeTravelControls
					controlSizePx={controlSizePx}
					isDevtoolsOpen={isDevtoolsOpen}
					markBusy={markUserAction}
					onToggleDevtools={onToggleDevtools}
				/>
				<UrlFormatToggle />
				<CopyLinkButton />
				<CompareLinkButton dataset="books" verticalId="react-rtk" />
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
