/**
 * `<WineApp />` — the wine page shell. Mobile-first: a single stacked column on small
 * viewports (filters behind a "Filters" disclosure), promoting to a two-column layout (static
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
 * Below `lg` the sidebar card collapses: react-ui's `<FilterCollapse />` renders a "Filters" /
 * "Hide filters" button above the same `<WineFilterPanel />`, which it hides with the `hidden`
 * attribute rather than unmounting, so the panel's local state survives a close — the inline collapse
 * every other app renders. The `useIsDesktop()` hook (min-width 1024, mirroring Tailwind's `lg`) only
 * decides whether the card collapses; there is ONE `<WineFilterPanel />` instance in the tree at every
 * width. Base styles target the smallest viewport; every larger-screen tweak is a `lg:` (min-width)
 * override, per the house mobile-first rule.
 *
 * The result count + computing indicator live in `<ResultsHeader />` (rendered above the result
 * grid), not in the page header, which carries the brand identity (mark + wordmark) plus the
 * time-travel and URL controls.
 */


import { AppHeaderBrand } from '@filter-enginez/examples-shared/app-header';
import { TimeTravelControls } from '@filter-enginez/examples-shared/devtools';
import { CompareLinkButton, CopyLinkButton, UrlFormatToggle } from '@filter-enginez/examples-shared/url';
import { useIsDesktop } from '@filter-enginez/examples-shared/viewport';
import {
	describeBootedWineCorpusTier,
	DevtoolsPanel,
	markUserAction,
	WineFilterPanel,
	WineResultGrid,
} from '@filter-enginez/examples-shared/wine';
import { useLastChange } from '@filter-enginez/react-signals';
import { FilterCollapse } from '@filter-enginez/react-ui';
import { useState } from 'react';

import { ResultsHeader } from './ResultsHeader.js';

/**
 * The wine page shell.
 */
export const WineApp = (): React.ReactElement => {
	// Devtools panel visibility — toggled via the wrench icon in the header. Default hidden
	// so first-time visitors get a clean UI; opens on click for anyone wanting to see the
	// action log or time-travel via undo/redo.
	const [isDevtoolsVisible, setIsDevtoolsVisible] = useState(false);
	// The two-column breakpoint switch. `true` at ≥1024px (Tailwind `lg`): the sidebar card is always
	// open. `false` below: it collapses behind the "Filters" button. Either way it holds the one
	// <WineFilterPanel /> instance.
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
				{/* The filter sidebar card — sticky at `lg`+, a "Filters" disclosure below it. The card owns
				    the chrome but NOT the scrolling: <WineFilterPanel /> nests its own header + scroll
				    container, so the header stays put while the sections below it scroll, and the collapse
				    region passes the card's height down to that scroller. */}
				<FilterCollapse isCollapsible={!isDesktop}>
					<WineFilterPanel />
				</FilterCollapse>
				<section className="flex-1 min-w-0 flex flex-col gap-4">
					{/* The result-count + computing-indicator + active-filters row sits between
					    the filter sidebar and the result grid. Visually anchored above the
					    grid (not inside the page header) so the per-page numbers are in the
					    same column as the results they describe. */}
					<ResultsHeader />
					{/* Devtools panel — mounts inline above the result grid when open, in the document
					    flow: color-coded rows, a scrubbable timeline and an optimistic cursor. Toggled by
					    the `>_` icon in the page header. */}
					<DevtoolsPanel open={isDevtoolsVisible} onClose={() => setIsDevtoolsVisible(false)} />
					<WineResultGrid />
				</section>
			</main>
			<Footer />
		</div>
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
			{/* `'worker'` is not decoration — this route boots the 150k corpus into a Comlink worker, as
			    every other wine route reports. Without it the header would claim a main-thread engine, and the
			    shared e2e wine suite, whose boot wait is `subtitle('Wine', id, 'worker')`, would time out on
			    an app that booted fine. */}
			<AppHeaderBrand page="Wine" tier="worker" verticalId="react-plain" />
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
				<CompareLinkButton dataset="wine" />
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
