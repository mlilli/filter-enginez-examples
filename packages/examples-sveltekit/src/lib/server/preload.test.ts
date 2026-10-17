/**
 * Tests for `preloadFirstScreenAsset`: SvelteKit's default for scripts and stylesheets, plus exactly
 * the two first-screen brand fonts.
 *
 * @remarks
 * The URLs are the shapes SvelteKit hands the option: relative to the page, under
 * `_app/immutable`, with the content hash after a dot.
 */

import { describe, expect, it } from 'vitest';

import { PRELOADED_FONT_STEMS, preloadFirstScreenAsset } from './preload.js';

/** The immutable-asset directory SvelteKit writes into. */
const ASSETS = './_app/immutable/assets';

describe('preloadFirstScreenAsset', () => {
	it('keeps SvelteKit’s default: every script and every stylesheet', () => {
		expect(preloadFirstScreenAsset({ path: './_app/immutable/entry/start.CqHyEDq9.js', type: 'js' })).toBe(true);
		expect(preloadFirstScreenAsset({ path: `${ASSETS}/0.C58bFtaH.css`, type: 'css' })).toBe(true);
	});

	it.each([
		['the display face', `${ASSETS}/FilterEngineZDisplay-Subset.MLGdfEdp.woff2`],
		['Inter', `${ASSETS}/Inter-Subset.DlVByD-t.woff2`],
	])('preloads %s', (_name, path) => {
		expect(preloadFirstScreenAsset({ path, type: 'font' })).toBe(true);
	});

	it('does not preload JetBrains Mono, which the first screen barely sets', () => {
		expect(preloadFirstScreenAsset({ path: `${ASSETS}/JetBrainsMono-Subset.Cw6iHCa_.woff2`, type: 'font' })).toBe(false);
	});

	it('matches a stem only as the whole name before the hash, not as a prefix of another font', () => {
		expect(preloadFirstScreenAsset({ path: `${ASSETS}/Inter-Subset-Italic.AbCdEf12.woff2`, type: 'font' })).toBe(false);
	});

	it('does not preload other assets', () => {
		expect(preloadFirstScreenAsset({ path: `${ASSETS}/mark.Ab12Cd34.svg`, type: 'asset' })).toBe(false);
	});

	it('names exactly the two first-screen faces', () => {
		expect([...PRELOADED_FONT_STEMS].sort()).toEqual(['FilterEngineZDisplay-Subset', 'Inter-Subset']);
	});
});
