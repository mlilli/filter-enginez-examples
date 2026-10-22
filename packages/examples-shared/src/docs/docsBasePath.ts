/**
 * Where the documentation is mounted, for the links between its pages.
 *
 * @remarks
 * The same pages are served at the root of the documentation site and under `/docs` in the two React
 * demo apps (`../page-meta/pageMeta.ts` names both base paths). Every link between them is written as
 * the target's path on the documentation site (`/rules/range`, `/` for the home) and placed under the
 * base path the section was mounted at, which {@link docsRouteAt} provides here for every page it
 * renders. A page rendered outside the section reads the demo apps' `/docs`.
 *
 * @packageDocumentation
 */

import { createContext, use } from 'react';

import { DOCS_APP_BASE_PATH, type DocsBasePath, docsPathUnder } from '../page-meta/pageMeta.js';

/** The base path the documentation section is mounted at. */
export const DocsBasePathContext = createContext<DocsBasePath>(DOCS_APP_BASE_PATH);

/**
 * The documentation's own link builder, for the base path the section is mounted at.
 *
 * @returns A function from a page's path on the documentation site to its path here.
 */
export function useDocsPath(): (sitePath: string) => string {
	const basePath = use(DocsBasePathContext);

	return (sitePath: string): string => docsPathUnder(basePath, sitePath);
}
