/**
 * The `/docs` route subtree, shared by both React apps and the standalone docs site so the docs section is defined once.
 *
 * @remarks
 * A react-router `RouteObject`: a `<DocsLayout>` parent (sidebar + `<Outlet />`) with the overview,
 * per-rule, per-algorithm, playground, and API-reference children. Each app spreads `docsRoute` into
 * its `createBrowserRouter([...])`, keeping the docs identical across the RTK + plain apps.
 *
 * @packageDocumentation
 */

import { type RouteObject } from 'react-router';

import { AlgorithmDocPage } from './AlgorithmDocPage.js';
import { DocsApiPage } from './DocsApiPage.js';
import { DocsHomePage } from './DocsHomePage.js';
import { DocsLayout } from './DocsLayout.js';
import { DocsPlaygroundPage } from './DocsPlaygroundPage.js';
import { RuleDocPage } from './RuleDocPage.js';

/** The `/docs` layout route + its children. */
export const docsRoute: RouteObject = {
	children: [
		{ element: <DocsHomePage />, index: true },
		{ element: <RuleDocPage />, path: 'rules/:ruleId' },
		{ element: <AlgorithmDocPage />, path: 'algorithms/:algoId' },
		{ element: <DocsPlaygroundPage />, path: 'playground' },
		{ element: <DocsApiPage />, path: 'api' },
	],
	element: <DocsLayout />,
	path: '/docs',
};
