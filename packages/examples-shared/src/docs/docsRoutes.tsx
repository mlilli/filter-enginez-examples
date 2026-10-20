/**
 * The `/docs` route subtree, shared by both React apps and the standalone docs site so the docs section is defined once.
 *
 * @remarks
 * A react-router `RouteObject`: a `<DocsLayout>` parent (sidebar + `<Outlet />`) with the overview,
 * per-rule, per-algorithm, playground, and API-reference children. Each app puts `docsRoute` in the
 * route table it gives `AppRouter` (`examples-shared/app-router`), keeping the docs identical across
 * the RTK + plain apps.
 *
 * ### Every page is loaded on demand
 *
 * Nothing under `/docs` is in an app's startup bundle. The layout and each page are `React.lazy`
 * components, each its own chunk, so a visitor who never opens the docs never downloads them, and one
 * who does fetches only the layout and the page they asked for. The playground is the page that most
 * needs it: it runs a real engine, so its chunk carries `@filter-enginez/core`, which no other docs
 * page needs.
 *
 * ### What shows while the code arrives
 *
 * The section is one `<Suspense>` boundary around the layout, with {@link DocsLoadingScreen} as its
 * fallback, and no boundary inside it:
 *
 * - **A visit that starts on a docs URL** shows the loading screen until both the layout and the page
 *   have arrived, then the page: one wait, never a layout with an empty outlet. The section asks for
 *   the page's chunk as soon as it mounts ({@link docsPageFor}), so the two download side by side
 *   rather than one after the other.
 * - **Moving from one docs page to another** keeps the current page on screen until the next one's
 *   code has arrived, because the router's navigations are transitions and React holds a boundary
 *   that is already showing content rather than replacing it with its fallback.
 * - **Opening the docs from another page of an app** mounts the boundary afresh, so it shows the
 *   loading screen until the section's code arrives.
 *
 * A chunk that fails to load throws to the app's error boundary, which shows the page-error screen.
 *
 * Each loader imports its page module directly rather than through this slice's barrel. A dynamic
 * `import()` of a module that is also imported statically into the same chunk cannot split anything,
 * so these paths name the page files themselves, which nothing else on an app's startup graph imports.
 *
 * @packageDocumentation
 */

import { type ComponentType, lazy, type LazyExoticComponent, Suspense, useEffect } from 'react';
import { matchPath, type RouteObject, useLocation } from 'react-router';

import { DocsLoadingScreen } from './DocsLoadingScreen.js';

/** The path the docs section is mounted at. */
const DOCS_PATH = '/docs';

/** One docs page: where it sits under `/docs`, how its code is fetched, and the component that waits for it. */
export interface DocsPageRoute {
	/** The child path under `/docs`; `''` for the overview, the section's index. */
	readonly path: string;
	/** Fetch the page's chunk, resolving to its component. Calling it again reuses the same module. */
	readonly load: () => Promise<ComponentType>;
	/** The page as a lazy component, which suspends until {@link DocsPageRoute.load} resolves. */
	readonly Page: LazyExoticComponent<ComponentType>;
}

/**
 * A docs page, from its path and its loader.
 *
 * @param path - The child path under `/docs`; `''` for the index.
 * @param load - Fetches the page's component.
 * @returns The page's route entry.
 */
function docsPage(path: string, load: () => Promise<ComponentType>): DocsPageRoute {
	return { load, Page: lazy(async () => ({ default: await load() })), path };
}

/** The docs pages, in the order the sidebar lists them. */
export const DOCS_PAGE_ROUTES: readonly DocsPageRoute[] = [
	docsPage('', async () => (await import('./DocsHomePage.js')).DocsHomePage),
	docsPage('rules/:ruleId', async () => (await import('./RuleDocPage.js')).RuleDocPage),
	docsPage('algorithms/:algoId', async () => (await import('./AlgorithmDocPage.js')).AlgorithmDocPage),
	docsPage('playground', async () => (await import('./DocsPlaygroundPage.js')).DocsPlaygroundPage),
	docsPage('api', async () => (await import('./DocsApiPage.js')).DocsApiPage),
];

/**
 * Fetch the layout every docs page renders inside.
 *
 * @returns The layout component.
 */
export async function loadDocsLayout(): Promise<ComponentType> {
	return (await import('./DocsLayout.js')).DocsLayout;
}

/** The layout, as a lazy component. */
const DocsLayoutPage = lazy(async () => ({ default: await loadDocsLayout() }));

/**
 * The docs page a path shows, matched the way the router matches the section's children.
 *
 * @param pathname - A path.
 * @returns The page's route entry, or `undefined` for a path no docs page answers.
 */
export function docsPageFor(pathname: string): DocsPageRoute | undefined {
	return DOCS_PAGE_ROUTES.find(({ path }) => matchPath(`${DOCS_PATH}/${path}`, pathname) !== null);
}

/**
 * The docs section: the layout inside the section's one loading boundary.
 *
 * @remarks
 * On mount it starts fetching the current page's chunk, which the layout would otherwise ask for only
 * once its own chunk had arrived and rendered the outlet.
 *
 * @returns The section.
 */
const DocsSection = (): React.ReactElement => {
	const { pathname } = useLocation();

	useEffect(() => {
		// Fetch only, and settle quietly: a chunk that fails to load fails again where the page renders,
		// through its lazy component, and the app's error boundary reports it there.
		void Promise.allSettled([docsPageFor(pathname)?.load()]);
	}, [pathname]);

	return (
		<Suspense fallback={<DocsLoadingScreen />}>
			<DocsLayoutPage />
		</Suspense>
	);
};

/** The `/docs` layout route + its children, each loaded on first visit. */
export const docsRoute: RouteObject = {
	children: DOCS_PAGE_ROUTES.map(({ Page, path }) => (path === '' ? { element: <Page />, index: true } : { element: <Page />, path })),
	element: <DocsSection />,
	path: DOCS_PATH,
};
