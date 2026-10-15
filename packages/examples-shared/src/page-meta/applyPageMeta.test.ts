/**
 * Tests for writing a page's metadata into the document head.
 *
 * @remarks
 * The case that matters is the navigation: a canonical link must never survive onto a page that is not
 * indexed, nor a `noindex` onto one that is, and each tag must be updated in place rather than
 * duplicated.
 *
 * @packageDocumentation
 */

import { afterEach, describe, expect, it } from 'vitest';

import { applyPageMeta } from './applyPageMeta.js';

/** An indexable page. */
const PAGE = { canonicalUrl: 'https://vue.filterenginez.com/wine', description: 'Wine reviews', title: 'Wine — Vue' };

/** A page that is not indexed. */
const NOT_FOUND = { canonicalUrl: null, description: '', title: 'Page not found' };

afterEach(() => {
	document.head.replaceChildren();
	document.title = '';
});

describe('applyPageMeta', () => {
	it('writes the title, the description and the canonical link, creating the tags a bare head lacks', () => {
		applyPageMeta(document, PAGE);

		expect(document.title).toBe('Wine — Vue');
		expect(document.head.querySelector('meta[name="description"]')?.getAttribute('content')).toBe('Wine reviews');
		expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(PAGE.canonicalUrl);
		expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
	});

	it('updates the shell’s own description in place rather than adding a second', () => {
		const shellDescription = document.createElement('meta');

		shellDescription.setAttribute('name', 'description');
		shellDescription.setAttribute('content', 'The hub');
		document.head.append(shellDescription);

		applyPageMeta(document, PAGE);
		applyPageMeta(document, { ...PAGE, canonicalUrl: 'https://vue.filterenginez.com/books' });

		expect(document.head.querySelectorAll('meta[name="description"]')).toHaveLength(1);
		expect(shellDescription.getAttribute('content')).toBe('Wine reviews');
		expect(document.head.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
		expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://vue.filterenginez.com/books');
	});

	it('drops the canonical and adds noindex on a page that is not indexed, and reverses both on the way back', () => {
		applyPageMeta(document, PAGE);
		applyPageMeta(document, NOT_FOUND);

		expect(document.head.querySelector('link[rel="canonical"]')).toBeNull();
		expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex');

		applyPageMeta(document, NOT_FOUND);
		expect(document.head.querySelectorAll('meta[name="robots"]')).toHaveLength(1);

		applyPageMeta(document, PAGE);
		expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
		expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(PAGE.canonicalUrl);
	});
});
