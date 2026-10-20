/**
 * `<BooksConfigApp />` — the JSON-driven-config showcase (plain / signals-only app).
 *
 * @remarks
 * The signals-surface sibling of the RTK `<BooksConfigApp />` — identical layout + the same
 * engine-busy resolver; the only difference is the footer reads no Redux mirror (there is none), so
 * it's static brand/meta. Boots its engine from `booksFilterConfig` via `loadConfig`
 * (`bootBooksConfigEngine`) and renders the whole panel from that same config through
 * `<ConfigDrivenPanel />`, with the raw JSON shown side-by-side. See the RTK twin for the full
 * rationale (the "the filter UI is a function of the data" thesis).
 *
 * @packageDocumentation
 */

import { AppHeaderBrand } from '@filter-enginez/examples-shared/app-header';
import {
	BooksResultGrid,
	captureCurrentVersion,
	ConfigDrivenPanel,
	ConfigJsonView,
	getBootedBooksFilterConfig,
	markResolvedAtLeast,
} from '@filter-enginez/examples-shared/books';
import { CompareLinkButton, CopyLinkButton, UrlFormatToggle } from '@filter-enginez/examples-shared/url';
import { useIsDesktop } from '@filter-enginez/examples-shared/viewport';
import { useLastChange } from '@filter-enginez/react-signals';
import { FilterDrawer } from '@filter-enginez/react-ui';
import { useEffect, useState } from 'react';

import { BooksResultsHeader } from './BooksResultsHeader.js';

/**
 * The config-driven books page shell.
 */
export const BooksConfigApp = (): React.ReactElement => {
	// The config the engine booted from. `<DatasetRoute>` renders this shell only once the boot has
	// resolved, and reading the config from the boot keeps the books dataset out of this module's
	// static imports, so the dataset chunk loads with `/books-config` rather than at app startup.
	const booksFilterConfig = getBootedBooksFilterConfig();
	// Mobile filter-drawer visibility — only meaningful below `lg`, where the sidebar collapses.
	const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
	// Two-column breakpoint switch — `true` at ≥1024px (static sidebar), `false` below (drawer).
	const isDesktop = useIsDesktop();
	// Resolve the engine-busy tracker on every settle (books is main-thread + synchronous) — same
	// rationale as `<BooksApp />`.
	const lastChange = useLastChange();

	useEffect(() => {
		markResolvedAtLeast(captureCurrentVersion());
	}, [lastChange]);

	return (
		<div className="min-h-screen flex flex-col">
			<Header />
			{/* One main landmark for everything between the header and the footer: the thesis line and the
			    config banner frame the panel and the results, and outside a landmark they would be content
			    no landmark navigation reaches. */}
			<main className="flex-1 flex flex-col">
				<div className="max-w-[1600px] w-full mx-auto px-4 lg:px-6 pt-3">
					<ThesisNote />
				</div>
				{/* Below `xl`, the config is a full-width collapsible banner (open on desktop widths). */}
				<details
					className="xl:hidden max-w-[1600px] w-full mx-auto px-4 lg:px-6 pt-3"
					open={isDesktop}
				>
					<summary
						className="text-xs uppercase cursor-pointer"
						style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', paddingBottom: '0.5rem' }}
					>
						Filter config (JSON) — the panel below is generated from this
					</summary>
					<ConfigJsonView config={booksFilterConfig} maxHeight="40vh" />
				</details>
				<div className="flex-1 flex flex-col lg:flex-row gap-4 lg:gap-6 px-4 py-3 lg:px-6 lg:py-4 max-w-[1600px] w-full mx-auto">
					{/* Side-by-side config JSON — a sticky column at `xl` and up. */}
					<aside
						className="hidden xl:flex xl:flex-col w-96 shrink-0 sticky top-4 self-start"
						style={{ maxHeight: 'calc(100vh - 2rem)' }}
					>
						<ConfigColumnLabel />
						<ConfigJsonView config={booksFilterConfig} maxHeight="calc(100vh - 8rem)" />
					</aside>
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
							<ConfigDrivenPanel config={booksFilterConfig} />
						</aside>
					) : (
						<FilterDrawer
							isOpen={isFilterDrawerOpen}
							onClose={() => setIsFilterDrawerOpen(false)}
							title="Filters"
							ariaLabel="Book filters (config-generated)"
							keepMounted
						>
							<ConfigDrivenPanel config={booksFilterConfig} isHeaderVisible={false} />
						</FilterDrawer>
					)}
					<section className="flex-1 min-w-0 flex flex-col gap-4">
						{!isDesktop ? <FiltersTrigger onOpen={() => setIsFilterDrawerOpen(true)} /> : null}
						<BooksResultsHeader />
						<BooksResultGrid />
					</section>
				</div>
			</main>
			<Footer />
		</div>
	);
};

/**
 * Short caption framing the demo — the one-line thesis over the panel.
 *
 * @internal
 */
const ThesisNote = (): React.ReactElement => {
	return (
		<p
			className="text-xs"
			style={{ color: 'var(--gray-9)', fontFamily: 'var(--font-mono)', letterSpacing: '0.02em', lineHeight: 1.6, margin: 0 }}
		>
			The filter panel below is <span style={{ color: 'var(--accent)' }}>generated entirely from the JSON config</span> — the
			engine is booted with <code style={{ color: 'var(--accent)' }}>loadConfig(booksFilterConfig)</code> and each control is
			derived from a rule&rsquo;s type + field. No filter UI is hand-written. The filter UI is a function of the data.
		</p>
	);
};

/**
 * Label above the side-by-side config column.
 *
 * @internal
 */
const ConfigColumnLabel = (): React.ReactElement => {
	return (
		<h2
			className="text-xs uppercase"
			style={{
				color: 'var(--accent)',
				fontFamily: 'var(--font-mono)',
				letterSpacing: '0.14em',
				margin: '0 0 0.5rem',
			}}
		>
			FilterEngineConfig · JSON
		</h2>
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
 * Page header — the shared header brand (the way home, back to this app's hub, and to every other
 * demo) beside the page's controls.
 *
 * @internal
 */
const Header = (): React.ReactElement => {
	return (
		<header
			className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 lg:px-6 lg:py-4"
			style={{ background: 'var(--gray-0)', borderBottom: '1px solid var(--gray-3)' }}
		>
			<AppHeaderBrand page="Books" tier="config" verticalId="react-plain" />
			<div className="flex flex-wrap items-center justify-end gap-2">
				<UrlFormatToggle />
				<CopyLinkButton />
				<CompareLinkButton dataset="books" />
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
				<span>filter-enginez · books demo · config-driven · main-thread engine</span>
				<span>
					filters via <code style={{ color: 'var(--accent)' }}>loadConfig(booksFilterConfig)</code>
				</span>
			</div>
		</footer>
	);
};
