/**
 * Tests for the documentation pages' titles, descriptions and canonical URLs.
 *
 * @packageDocumentation
 */

import { describe, expect, it } from 'vitest';

import { ALGORITHM_TEXTS } from '../docs/content/algorithmsText.js';
import { RULE_DOCS } from '../docs/content/rulesContent.js';
import { DOCS_HOME_DESCRIPTION, DOCS_HOME_TITLE, docsPageMeta, docsPagePaths } from './docsPageMeta.js';

describe('docsPagePaths', () => {
	it('lists the home, a page per rule and per algorithm, the playground and the API reference', () => {
		const paths = docsPagePaths();

		// Non-vacuous: the catalogs are populated.
		expect(RULE_DOCS.length).toBeGreaterThan(10);
		expect(ALGORITHM_TEXTS.length).toBeGreaterThan(5);
		expect(paths).toEqual([
			'/docs',
			...RULE_DOCS.map((rule) => `/docs/rules/${rule.id}`),
			...ALGORITHM_TEXTS.map((algorithm) => `/docs/algorithms/${algorithm.id}`),
			'/docs/playground',
			'/docs/api',
		]);
		expect(new Set(paths).size).toBe(paths.length);
	});
});

describe('docsPageMeta', () => {
	it('gives the home the title and description the documentation site’s shell carries', () => {
		expect(docsPageMeta('/docs')).toEqual({
			canonicalUrl: 'https://docs.filterenginez.com/docs',
			description: DOCS_HOME_DESCRIPTION,
			title: DOCS_HOME_TITLE,
		});
	});

	it('names a rule page after the rule and describes it in the catalog’s words', () => {
		const [rule] = RULE_DOCS;

		expect(docsPageMeta(`/docs/rules/${rule?.id ?? ''}/`)).toEqual({
			canonicalUrl: `https://docs.filterenginez.com/docs/rules/${rule?.id ?? ''}`,
			description: `${rule?.name ?? ''}: ${rule?.simple ?? ''}`,
			title: `${rule?.name ?? ''} — Filter EngineZ docs`,
		});
	});

	it('gives every page a canonical URL on the documentation site and a distinct title', () => {
		const described = docsPagePaths().map((path) => docsPageMeta(path));

		expect(described.map((meta) => meta.canonicalUrl)).toEqual(docsPagePaths().map((path) => `https://docs.filterenginez.com${path}`));
		expect(new Set(described.map((meta) => meta.title)).size).toBe(described.length);
		expect(described.every((meta) => meta.description.length > 40)).toBe(true);
	});

	it('treats a path naming no page as not found', () => {
		expect(docsPageMeta('/docs/rules/no-such-rule')).toEqual({
			canonicalUrl: null,
			description: '',
			title: `Page not found — ${DOCS_HOME_TITLE}`,
		});
	});
});
