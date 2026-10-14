/**
 * `<DocsLoadingScreen />` — what a cold load onto a `/docs` URL shows while the docs code arrives.
 *
 * @remarks
 * The docs are lazy routes (see `docsRoutes.tsx`), so a visit that STARTS on a docs URL has a moment in
 * which the router has matched the route but not yet received its code. react-router renders the
 * route's `HydrateFallback` for that moment; this is it. Navigating INTO the docs from a page that is
 * already on screen never shows it, because the router keeps that page up until the docs are ready.
 *
 * It is the brand boot loader on the docs' own background, sized and placed the way every dataset's
 * boot screen places it, so the first thing a docs visitor sees is the same loader a dataset visitor
 * sees. No caption: there is no corpus streaming here and nothing to count, and the loader carries its
 * own accessible name.
 *
 * Inline styles rather than utility classes, because the standalone documentation site renders this
 * too and is not a Tailwind app.
 *
 * @packageDocumentation
 */

import { BrainSynapse } from '@filter-enginez/brand';

/**
 * The full-screen docs loader.
 *
 * @returns The loader, centered on the docs background.
 */
export const DocsLoadingScreen = (): React.ReactElement => (
	<div
		style={{
			alignItems: 'center',
			background: 'var(--gray-0)',
			display: 'flex',
			justifyContent: 'center',
			minHeight: '100vh',
			padding: '0 24px',
		}}
	>
		<BrainSynapse width={520} ariaLabel="Loading the documentation" className="fe-boot-loader" />
	</div>
);
