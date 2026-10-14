/**
 * Test for the shared `/docs` route subtree — its shape, and that every lazy route loads the page it
 * names.
 *
 * @remarks
 * The lazy loaders are the part a typo breaks silently: `lazy: { Component: … }` resolving to
 * `undefined` (a misspelled export) type-checks as a missing component and renders an empty outlet in
 * the browser. So each loader is called here and must resolve to the very component its page module
 * exports, compared by identity rather than by name.
 *
 * @packageDocumentation
 */

import type { RouteObject } from 'react-router';

import { describe, expect, it } from 'vitest';

import { AlgorithmDocPage } from './AlgorithmDocPage.js';
import { DocsApiPage } from './DocsApiPage.js';
import { DocsHomePage } from './DocsHomePage.js';
import { DocsLayout } from './DocsLayout.js';
import { DocsLoadingScreen } from './DocsLoadingScreen.js';
import { DocsPlaygroundPage } from './DocsPlaygroundPage.js';
import { docsRoute } from './docsRoutes.js';
import { RuleDocPage } from './RuleDocPage.js';

/**
 * Resolve a route's lazy `Component`.
 *
 * @param route - A route declared with object-form `lazy`.
 * @returns What its `Component` loader resolves to.
 * @throws If the route has no lazy `Component` loader.
 */
async function loadComponent(route: RouteObject | undefined): Promise<unknown> {
	const lazy = route?.lazy;

	if (lazy === undefined || typeof lazy === 'function' || lazy.Component === undefined) {
		throw new Error(`route ${route?.path ?? '(index)'} has no lazy Component loader`);
	}

	return lazy.Component();
}

describe('docsRoute', () => {
	it('defines the /docs layout route with its five children', () => {
		expect(docsRoute.path).toBe('/docs');
		expect(docsRoute.children).toHaveLength(5);
	});

	it('renders nothing eagerly — the layout and every page are lazy routes', () => {
		// A static `element` or `Component` here would put that page back into every app's startup bundle.
		const routes = [docsRoute, ...(docsRoute.children ?? [])];

		expect(routes.filter((route) => route.element !== undefined || route.Component !== undefined)).toEqual([]);
	});

	it('shows the docs loader while a cold load fetches the docs code', () => {
		expect(docsRoute.HydrateFallback).toBe(DocsLoadingScreen);
	});

	it('loads the layout', async () => {
		expect(await loadComponent(docsRoute)).toBe(DocsLayout);
	});

	it.each([
		['the overview', undefined, DocsHomePage],
		['a rule page', 'rules/:ruleId', RuleDocPage],
		['an algorithm page', 'algorithms/:algoId', AlgorithmDocPage],
		['the playground', 'playground', DocsPlaygroundPage],
		['the API reference', 'api', DocsApiPage],
	])('loads %s', async (_name, path, page) => {
		const route = docsRoute.children?.find((child) => child.path === path);

		expect(route?.index === true).toBe(path === undefined);
		expect(await loadComponent(route)).toBe(page);
	});
});
