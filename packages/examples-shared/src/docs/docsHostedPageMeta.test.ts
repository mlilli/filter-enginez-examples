/**
 * Tests for the page metadata of an app that serves the documentation too.
 *
 * @packageDocumentation
 */

import { describe, expect, it } from 'vitest';

import { verticalPageMeta } from '../page-meta/pageMeta.js';
import { docsHostedPageMeta } from './docsHostedPageMeta.js';

describe('docsHostedPageMeta', () => {
	const resolve = docsHostedPageMeta('react-rtk');

	it('answers the app’s own pages at once, canonical on the app', () => {
		expect(resolve('/wine')).toEqual(verticalPageMeta('react-rtk', '/wine'));
	});

	it('points a documentation path at the documentation site', async () => {
		const meta = await resolve('/docs/playground');

		expect(meta.canonicalUrl).toBe('https://docs.filterenginez.com/playground');
		expect(meta.title).toBe('Playground — Filter EngineZ docs');
	});
});
