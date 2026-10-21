/**
 * `<RealEstateApp />` — the real-estate page shell (plain / signals-only). Mobile-first: a single
 * stacked column on small viewports (filters behind a "Filters" disclosure), promoting to a two-column
 * layout (static filter sidebar + result grid) at the `lg` breakpoint and up.
 *
 * @remarks
 * The signals-surface sibling of the RTK `<RealEstateApp />` — identical layout + the same engine-busy
 * resolver, the same header controls (undo / redo / devtools toggle via the shared
 * `<TimeTravelControls />`, plus the URL controls) and the same inline `<DevtoolsPanel />`; the only
 * difference is the footer reads no Redux mirror (there is none), so it's static brand/meta.
 *
 * @packageDocumentation
 */

import { AppHeaderBrand } from '@filter-enginez/examples-shared/app-header';
import { DevtoolsPanel, TimeTravelControls } from '@filter-enginez/examples-shared/devtools';
import { captureCurrentVersion, markResolvedAtLeast, markUserAction, RealEstateFilterPanel, RealEstateResultGrid, useIsEngineBusy } from '@filter-enginez/examples-shared/real-estate';
import { CompareLinkButton, CopyLinkButton, UrlFormatToggle } from '@filter-enginez/examples-shared/url';
import { useIsDesktop } from '@filter-enginez/examples-shared/viewport';
import { useLastChange } from '@filter-enginez/react-signals';
import { FilterCollapse } from '@filter-enginez/react-ui';
import { useEffect, useState } from 'react';

import { RealEstateResultsHeader } from './RealEstateResultsHeader.js';

/**
 * The real-estate page shell.
 */
export const RealEstateApp = (): React.ReactElement => {
	const isDesktop = useIsDesktop();
	// Devtools panel visibility — toggled by the `>_` icon in the header. Default hidden: it is a
	// developer surface, and an open timeline is the first thing to push the results below the fold.
	const [isDevtoolsVisible, setIsDevtoolsVisible] = useState(false);
	const isEngineBusy = useIsEngineBusy();
	// Resolve the engine-busy tracker on every settle (main-thread synchronous engine, no bundle fetch
	// to clear it) — same pattern as books; without it the "computing" pill would stick on.
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
				{/* The filter sidebar card — sticky at `lg`+, a "Filters" disclosure below it. */}
				<FilterCollapse isCollapsible={!isDesktop}>
					<RealEstateFilterPanel />
				</FilterCollapse>
				<section className="flex-1 min-w-0 flex flex-col gap-4">
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
 * Page header — the shared header brand (the way home, back to this app's hub, and to every other
 * demo) beside the page's controls.
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
			<AppHeaderBrand page="Real estate" verticalId="react-plain" />
			{/* The full header cluster, in the same order as every other route: time travel, URL format,
			    copy link, then compare. `?f=` sync runs in `DatasetRoute`; these controls are
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
				<CompareLinkButton dataset="real-estate" />
			</div>
		</header>
	);
};

/**
 * Footer — small static meta line (the plain app has no Redux mirror to source an engine mode from).
 *
 * @internal
 */
const Footer = (): React.ReactElement => {
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
					data via <code style={{ color: 'var(--accent)' }}>@filter-enginez/mock-data</code>
				</span>
			</div>
		</footer>
	);
};
