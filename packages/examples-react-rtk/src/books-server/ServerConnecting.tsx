/**
 * `<ServerConnecting />` — the `/books-server` route's loading screen.
 *
 * @remarks
 * Its own module because two things render it. `<BooksServerRoute>` shows it while the HTTP-backed
 * engine connects, and the router shows it while `<BooksServerRoute>` itself is still loading: that
 * route is a lazy chunk (`App.tsx`), and this screen is its `<Suspense>` fallback. So a visit shows
 * one screen from the first frame through to the connected app, whichever of the two waits is the
 * one in progress, and only this small module is in the startup bundle.
 *
 * @packageDocumentation
 */

import { BrainSynapse } from '@filter-enginez/brand';

/** Full-screen "talking to the server" loader — the brand `<BrainSynapse>` + a server caption. */
export const ServerConnecting = (): React.ReactElement => {
	// `<main>`: until the server answers, the loader is the page's main content.
	return (
		<main
			className="min-h-screen flex flex-col items-center justify-center gap-6 px-6"
			style={{ background: 'var(--gray-0)' }}
		>
			<BrainSynapse width={520} ariaLabel="Connecting to the filter server" className="fe-boot-loader" />
			<p
				className="text-xs uppercase"
				style={{ color: 'var(--gray-8)', fontFamily: 'var(--font-mono)', letterSpacing: '0.16em' }}
			>
				Filtering on the Node server · fetching corpus + initial state
			</p>
		</main>
	);
};
