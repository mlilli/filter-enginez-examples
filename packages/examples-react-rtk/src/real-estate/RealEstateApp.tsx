/**
 * `<RealEstateApp />` — the real-estate page shell. Mobile-first: a single stacked column on
 * small viewports (filters behind an off-canvas drawer), promoting to a two-column layout (static
 * filter sidebar + result grid) at the `lg` breakpoint and up.
 *
 * @remarks
 * Structurally the books shell's sibling — same mobile-first sidebar/drawer switch via
 * `useIsDesktop()` (exactly one `<RealEstateFilterPanel />` mounts, so no duplicate engine
 * subscriptions) and the same "result count + computing pill + active-filter chips live in
 * `<RealEstateResultsHeader />` above the grid" arrangement. Like books it carries the shared header
 * controls (undo / redo / devtools toggle via `<TimeTravelControls />`, plus the URL controls) and the
 * shared inline `<DevtoolsPanel />`.
 *
 * @packageDocumentation
 */

import { Mark } from '@filter-enginez/brand';
import { DevtoolsPanel, TimeTravelControls } from '@filter-enginez/examples-shared/devtools';
import { captureCurrentVersion, markResolvedAtLeast, markUserAction, RealEstateFilterPanel, RealEstateResultGrid, useIsEngineBusy } from '@filter-enginez/examples-shared/real-estate';
import { CompareLinkButton, CopyLinkButton, UrlFormatToggle } from '@filter-enginez/examples-shared/url';
import { verticalSubtitle } from '@filter-enginez/examples-shared/verticals';
import { useIsDesktop } from '@filter-enginez/examples-shared/viewport';
import { useLastChange } from '@filter-enginez/react-signals';
import { FilterDrawer } from '@filter-enginez/react-ui';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';

import { RealEstateResultsHeader } from './RealEstateResultsHeader.js';
import { useRealEstateSelector } from './store.js';

/**
 * The real-estate page shell.
 */
export const RealEstateApp = (): React.ReactElement => {
	const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
	const isDesktop = useIsDesktop();
	// Devtools panel visibility — toggled by the `>_` icon in the header. Default hidden: it is a
	// developer surface, and an open timeline is the first thing to push the results below the fold.
	const [isDevtoolsVisible, setIsDevtoolsVisible] = useState(false);
	const isEngineBusy = useIsEngineBusy();
	// Resolve the engine-busy tracker on every settle (main-thread synchronous engine, no bundle
	// fetch to clear it) — same pattern as books; without it the "computing" pill would stick on.
	const lastChange = useLastChange();

	useEffect(() => {
		markResolvedAtLeast(captureCurrentVersion());
	}, [lastChange]);

	return (
		<div className="min-h-screen flex flex-col">
			<Header
				controlSizePx={isDesktop ? 36 : 44}
				isDevtoolsOpen={isDevtoolsVisible}
				onToggleDevtools={() => setIsDevtoolsVisible((visible) => !visible)}
			/>
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
						<RealEstateFilterPanel />
					</aside>
				) : (
					<FilterDrawer
						isOpen={isFilterDrawerOpen}
						onClose={() => setIsFilterDrawerOpen(false)}
						title="Filters"
						ariaLabel="Listing filters"
						keepMounted
					>
						<RealEstateFilterPanel isHeaderVisible={false} />
					</FilterDrawer>
				)}
				<section className="flex-1 min-w-0 flex flex-col gap-4">
					{!isDesktop ? <FiltersTrigger onOpen={() => setIsFilterDrawerOpen(true)} /> : null}
					<RealEstateResultsHeader />
					{/* The action log + time-travel timeline. An inline card in the document flow (no
					    overlay, no slide) so it pushes the grid down rather than covering it — you are
					    usually scrubbing the timeline to watch the RESULTS change. */}
					<DevtoolsPanel
						isComputing={isEngineBusy}
						markBusy={markUserAction}
						onClose={() => setIsDevtoolsVisible(false)}
						open={isDevtoolsVisible}
					/>
					<RealEstateResultGrid />
				</section>
			</main>
			<Footer />
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
}): React.ReactElement => {
	const { controlSizePx, isDevtoolsOpen, onToggleDevtools } = props;

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
						{verticalSubtitle('Real estate', 'react-rtk')}
					</span>
				</div>
			</Link>
			{/* The full header cluster, in the same order as every other route: URL format, copy link,
			    then time travel. `?f=` sync runs in `DatasetRoute`; these controls are
			    what let the user SEE and copy the link it maintains. */}
			<div className="flex flex-wrap items-center justify-end gap-2">
				<TimeTravelControls
					controlSizePx={controlSizePx}
					isDevtoolsOpen={isDevtoolsOpen}
					markBusy={markUserAction}
					onToggleDevtools={onToggleDevtools}
				/>
				<UrlFormatToggle />
				<CopyLinkButton />
				<CompareLinkButton dataset="real-estate" verticalId="react-rtk" />
			</div>
		</header>
	);
};

/**
 * Footer — small meta line. Reads the engine mode from the Redux mirror (proving `state.filters.mode`
 * is live + selector-readable, same as the books/wine footers).
 *
 * @internal
 */
const Footer = (): React.ReactElement => {
	const mode = useRealEstateSelector((state) => state.filters.mode);

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
				<span>filter-enginez · real estate demo · main-thread engine</span>
				<span>
					engine mode <code style={{ color: 'var(--accent)' }}>{mode}</code>
					{' '}· data via <code style={{ color: 'var(--accent)' }}>@filter-enginez/mock-data</code>
				</span>
			</div>
		</footer>
	);
};
