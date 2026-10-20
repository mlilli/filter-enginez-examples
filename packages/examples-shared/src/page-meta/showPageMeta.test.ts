/**
 * Tests for writing the shown route's metadata into the document head.
 *
 * @packageDocumentation
 */

import { afterEach, describe, expect, it } from 'vitest';

import { type PageMeta } from './pageMeta.js';
import { showPageMeta } from './showPageMeta.js';

/**
 * Indexable metadata named after its path.
 *
 * @param pathname - The path.
 * @returns The metadata.
 */
function metaFor(pathname: string): PageMeta {
	return { canonicalUrl: `https://example.test${pathname}`, description: pathname, title: `Title ${pathname}` };
}

/** Let every settled promise's callbacks run. */
async function flush(): Promise<void> {
	await new Promise((resolve) => {
		setTimeout(resolve, 0);
	});
}

afterEach(() => {
	document.head.replaceChildren();
	document.title = '';
});

describe('showPageMeta', () => {
	it('applies metadata that is known at once', async () => {
		showPageMeta('/wine', metaFor);
		await flush();

		expect(document.title).toBe('Title /wine');
		expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://example.test/wine');
	});

	it('applies metadata that arrives later', async () => {
		showPageMeta('/docs', async (pathname) => Promise.resolve(metaFor(pathname)));
		await flush();

		expect(document.title).toBe('Title /docs');
	});

	it('writes into the document it is given', async () => {
		const other = document.implementation.createHTMLDocument('other');

		showPageMeta('/books', metaFor, other);
		await flush();

		expect(other.title).toBe('Title /books');
		expect(document.title).toBe('');
	});

	it('drops a resolution that arrives after it was cancelled, so a newer route keeps its head', async () => {
		let releaseSlow: (meta: PageMeta) => void = () => undefined;
		const cancelSlow = showPageMeta('/docs', async () => new Promise<PageMeta>((resolve) => {
			releaseSlow = resolve;
		}));

		cancelSlow();
		showPageMeta('/books', metaFor);
		await flush();
		releaseSlow(metaFor('/docs'));
		await flush();

		expect(document.title).toBe('Title /books');
	});

	it('leaves the head alone when a lookup fails', async () => {
		document.title = 'Shell title';
		showPageMeta('/docs', async () => Promise.reject(new Error('chunk failed to load')));
		await flush();

		expect(document.title).toBe('Shell title');
	});
});
