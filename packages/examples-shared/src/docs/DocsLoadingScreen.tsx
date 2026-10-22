/**
 * `<DocsLoadingScreen />` — what a cold load onto a documentation URL shows while the docs code arrives.
 *
 * @remarks
 * The docs are lazy components (see `docsRoutes.tsx`), so a visit that opens a docs URL has a moment
 * in which the router has matched the route but its code has not arrived. The docs section's
 * `<Suspense>` boundary shows this screen for that moment. Moving between docs pages never shows it,
 * because the router's navigations are transitions and React keeps the current page up until the
 * next one is ready.
 *
 * It is the brand boot loader on the docs' own background, sized and placed the way every dataset's
 * boot screen places it, so the first thing a docs visitor sees is the same loader a dataset visitor
 * sees. No caption: there is no corpus streaming here and nothing to count, and the loader carries its
 * own accessible name.
 *
 * A `<main>`, because for that moment the loader is the page's main content, and a page with no main
 * landmark fails the accessibility audit a visitor's tools may run before the docs arrive.
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
	<main
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
	</main>
);
