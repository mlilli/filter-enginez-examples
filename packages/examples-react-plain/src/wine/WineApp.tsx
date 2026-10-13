/**
 * `<WineApp />` — the wine page shell. Mobile-first: a single stacked column on small
 * viewports (filters behind an off-canvas drawer), promoting to a two-column layout (static
 * filter sidebar + result grid) at the `lg` breakpoint and up.
 *
 * @remarks
 * Layout shape at `lg` and up (≥1024px):
 *
 *   ┌─────────────────────────────────────────────────────┐
 *   │ Header (brand mark + wordmark)                      │
 *   ├──────────────┬──────────────────────────────────────┤
 *   │              │ ResultsHeader                        │
 *   │              │   ├ ActiveFiltersBar (chips)         │
 *   │              │   └ result count + computing pill    │
 *   │ Filter panel ├──────────────────────────────────────┤
 *   │ (320px)      │                                      │
 *   │              │ Result grid (auto-fill cards)        │
 *   │              │                                      │
 *   ├──────────────┴──────────────────────────────────────┤
 *   │ Footer (tiny meta)                                  │
 *   └─────────────────────────────────────────────────────┘
 *
 * Below `lg` the aside collapses: a "Filters" trigger opens the same `<WineFilterPanel />` inside
 * an off-canvas `<FilterDrawer />`. The `useIsDesktop()` hook (min-width 1024, mirroring Tailwind's
 * `lg`) decides which of the two mounts, so there is only ever ONE `<WineFilterPanel />` instance in
 * the tree. Base styles target the smallest viewport; every larger-screen tweak is a `lg:`
 * (min-width) override, per the house mobile-first rule.
 *
 * The result count + computing indicator live in `<ResultsHeader />` (rendered above the result
 * grid), not in the page header, which carries the brand identity (mark + wordmark) plus the
 * time-travel and URL controls.
 */


import { Mark } from '@filter-enginez/brand';
import { TimeTravelControls } from '@filter-enginez/examples-shared/devtools';
import { CompareLinkButton, CopyLinkButton, UrlFormatToggle } from '@filter-enginez/examples-shared/url';
import { verticalSubtitle } from '@filter-enginez/examples-shared/verticals';
import { useIsDesktop } from '@filter-enginez/examples-shared/viewport';
import {
	describeBootedWineCorpusTier,
	DevtoolsPanel,
	markUserAction,
	WineFilterPanel,
	WineResultGrid,
} from '@filter-enginez/examples-shared/wine';
import { useLastChange } from '@filter-enginez/react-signals';
import { FilterDrawer } from '@filter-enginez/react-ui';
import { useState } from 'react';
import { Link } from 'react-router';

import { ResultsHeader } from './ResultsHeader.js';

/**
 * The wine page shell.
 */
export const WineApp = (): React.ReactElement => {
	// Devtools panel visibility — toggled via the wrench icon in the header. Default hidden
	// so first-time visitors get a clean UI; opens on click for anyone wanting to see the
	// action log or time-travel via undo/redo.
	const [isDevtoolsVisible, setIsDevtoolsVisible] = useState(false);
	// Mobile filter drawer visibility — only meaningful below the `lg` breakpoint, where the
	// filter sidebar collapses behind a "Filters" trigger.
	const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
	// The two-column breakpoint switch. `true` at ≥1024px (Tailwind `lg`): render the static
	// sidebar. `false` below: render the off-canvas drawer + its trigger. Exactly one mounts, so
	// there is a single <WineFilterPanel /> instance regardless of viewport.
	const isDesktop = useIsDesktop();

	// Subscribe to lastChange so the page-header undo/redo controls re-render when the
	// engine's `canUndo` / `canRedo` flip (the values come from a signal-backed shim, but
	// reading them inside the Header component during render only captures the current
	// snapshot — useLastChange forces a re-render when state changes).
	useLastChange();

	return (
		<div className="min-h-screen flex flex-col">
			<Header
				onToggleDevtools={() => setIsDevtoolsVisible((v) => !v)}
				devtoolsOpen={isDevtoolsVisible}
				controlSizePx={isDesktop ? 36 : 44}
			/>
			{/* Base: single stacked column. `lg:` promotes to the two-column sidebar + grid row. */}
			<main className="flex-1 flex flex-col lg:flex-row gap-4 lg:gap-6 px-4 py-3 lg:px-6 lg:py-4 max-w-[1600px] w-full mx-auto">
				{/* Desktop filter sidebar — outer aside owns the sticky-positioned card chrome, but
				    NOT the scrolling. The internal nested structure (header + scroll container)
				    lives inside <WineFilterPanel /> itself, so the header stays put while the
				    filter sections below it scroll independently. The aside is `display: flex;
				    flex-direction: column` (via flex utility) so the inner scroll container can
				    `flex: 1` and pick up the remaining vertical space. Only mounts at `lg`+; below
				    that the same panel lives in the off-canvas drawer instead. */}
				{isDesktop ? (
					<aside
						className="w-80 shrink-0 sticky top-4 self-start flex flex-col"
						style={{
							background: 'var(--gray-1)',
							border: '1px solid var(--gray-3)',
							borderRadius: 'var(--radius-lg)',
							maxHeight: 'calc(100vh - 2rem)',
							// No internal padding here — the header + scroll container manage their
							// own horizontal/vertical padding so the scroll container's scrollbar
							// hugs the aside's right edge cleanly.
						}}
					>
						<WineFilterPanel />
					</aside>
				) : (
					<FilterDrawer
						isOpen={isFilterDrawerOpen}
						onClose={() => setIsFilterDrawerOpen(false)}
						title="Filters"
						ariaLabel="Wine filters"
						keepMounted
					>
						<WineFilterPanel isHeaderVisible={false} />
					</FilterDrawer>
				)}
				<section className="flex-1 min-w-0 flex flex-col gap-4">
					{/* Mobile-only "Filters" trigger — opens the off-canvas drawer. Hidden at `lg`+
					    where the static sidebar makes it redundant. */}
					{!isDesktop ? (
						<FiltersTrigger onOpen={() => setIsFilterDrawerOpen(true)} />
					) : null}
					{/* The result-count + computing-indicator + active-filters row sits between
					    the filter sidebar and the result grid. Visually anchored above the
					    grid (not inside the page header) so the per-page numbers are in the
					    same column as the results they describe. */}
					<ResultsHeader />
					{/* Devtools panel — mounts inline above the result grid when open. It keeps the
					    drawer variant's styling (color-coded rows, scrubbable timeline, optimistic
					    cursor) without the drawer overlay + slide animation; the panel lives in the
					    document flow. Toggled by the `>_` icon in the page header. */}
					<DevtoolsPanel open={isDevtoolsVisible} onClose={() => setIsDevtoolsVisible(false)} />
					<WineResultGrid />
				</section>
			</main>
			<Footer />
		</div>
	);
};

/**
 * Mobile "Filters" trigger — a 44px-tall button that opens the off-canvas filter drawer. Rendered
 * only below the `lg` breakpoint (where the static sidebar is hidden).
 *
 * @internal
 */
const FiltersTrigger = (props: { readonly onOpen: () => void }): React.ReactElement => {
	const { onOpen } = props;

	return (
		<button
			type="button"
			onClick={onOpen}
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
 * Page header — brand identity (mark + wordmark) plus the time-travel cluster (undo / redo /
 * devtools toggle) and the URL controls. Result count and computing indicator live in
 * `<ResultsHeader />` so the per-page numbers sit in the same column as the result grid they describe.
 *
 * @internal
 */
const Header = (props: {
	readonly controlSizePx: number;
	readonly devtoolsOpen: boolean;
	readonly onToggleDevtools: () => void;
}): React.ReactElement => {
	const { controlSizePx, devtoolsOpen: isDevtoolsOpen, onToggleDevtools } = props;

	return (
		<header
			className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 lg:px-6 lg:py-4"
			style={{
				background: 'var(--gray-0)',
				borderBottom: '1px solid var(--gray-3)',
			}}
		>
			<Link
				to="/"
				className="flex items-center gap-3 min-w-0"
				style={{ textDecoration: 'none' }}
				aria-label="Filter EngineZ — back to the dataset hub"
			>
				<Mark size={36} animated />
				{/* Brand wordmark — hidden on the narrowest phones (< 400px) so the header never
				    overflows into a horizontal scroll; the mark alone carries identity there. */}
				<div className="hidden min-[360px]:flex flex-col leading-tight">
					<span
						className="text-base font-semibold tracking-wider uppercase"
						style={{
							color: 'var(--gray-11)',
							fontFamily: 'var(--font-display)',
							letterSpacing: '0.14em',
						}}
					>
						Filter EngineZ
					</span>
					<span
						className="text-xs uppercase"
						style={{
							color: 'var(--gray-8)',
							fontFamily: 'var(--font-mono)',
							letterSpacing: '0.12em',
						}}
					>
						{/* `'worker'` is not decoration — this route boots the 130k corpus into a Comlink
						    worker, as every other wine route reports. Without it the header would claim a
						    main-thread engine, and the shared e2e wine suite, whose boot wait is
						    `subtitle('Wine', id, 'worker')`, would time out on an app that booted fine. */}
						{verticalSubtitle('Wine', 'react-plain', 'worker')}
					</span>
				</div>
			</Link>
			<div className="flex flex-wrap items-center justify-end gap-2">
				{/* Undo / redo / devtools toggle — the shared React cluster (icons + keyboard binding)
				    that every dataset page in both React apps renders. */}
				<TimeTravelControls
					controlSizePx={controlSizePx}
					isDevtoolsOpen={isDevtoolsOpen}
					markBusy={markUserAction}
					onToggleDevtools={onToggleDevtools}
				/>
				<UrlFormatToggle />
				<CopyLinkButton />
				<CompareLinkButton dataset="wine" verticalId="react-plain" />
			</div>
		</header>
	);
};

/**
 * Footer — small meta line at the bottom of the page. Subtle, easy to ignore unless you go
 * looking.
 *
 * @internal
 */
const Footer = (): React.ReactElement => {
	// The corpus tier the route actually booted, as every wine vertical reports it. A silent fallback
	// to the bundled tier is otherwise invisible, and the footer is one of the few places it shows.
	//
	// Read from the frozen boot-progress snapshot rather than `bundle.meta`: `datasets.tsx` drops
	// `meta` when `bootAndWire` returns, and threading it through the dataset registry would touch
	// every dataset's boot for one string.
	const corpusTier = describeBootedWineCorpusTier();

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
				<span>
					filter-enginez · wine demo · react + reactive-signals over a Comlink worker
					{corpusTier === '' ? '' : ` · ${corpusTier}`}
				</span>
				<span>
					data via{' '}
					<code style={{ color: 'var(--accent)' }}>@filter-enginez/mock-data</code>
				</span>
			</div>
		</footer>
	);
};
