/**
 * Tests for `dom` — the hyperscript helpers this vertical uses instead of a template language.
 *
 * @remarks
 * ### 🔴 `setHidden` must be asserted MECHANICALLY, and that is a measurement rather than a taste
 *
 * `setHidden` exists because `[hidden] { display: none }` is a UA rule, so any authored `display` on
 * the element's class beats it — the failure documented at `ui-styles`' `.fe-filter-collapse`
 * block. The tempting way to pin that is to inject the authored
 * rule, flip the flag, and assert `getComputedStyle(element).display`: an assertion about the
 * OUTCOME rather than the mechanism, which is normally the better test.
 *
 * **jsdom does not reproduce the cascade.** With
 * `.authored { display: flex }` on the element and the `hidden` attribute set, jsdom reports
 * `display: none`; a real browser reports `flex`. So a computed-style assertion resolves to `'none'`
 * under the correct implementation AND under the mutant that swaps `setHidden` for
 * `toggleAttribute('hidden', …)` — it is green over the exact defect this file exists to catch.
 *
 * These tests therefore assert the two things that DO differ between the implementations in an
 * environment that cannot tell their effects apart: an inline `display`, and the absence of a
 * `hidden` attribute. Do not "improve" them to `getComputedStyle` — that trade cancels the guard.
 *
 * (`.fe-filter-collapse` is the deliberate exception in the other direction, and jsdom can see that
 * one, because `:not([hidden])` is an AUTHOR rule rather than a UA one. It is pinned in
 * `shell/appShell.test.ts`.)
 *
 * @packageDocumentation
 */

import { describe, expect, it } from 'vitest';

import { append, el, setHidden, svg } from './dom.js';

describe('el', () => {
	it('creates a bare element when given no options', () => {
		const element = el('section');

		expect(element.tagName).toBe('SECTION');
		expect(element.className).toBe('');
		expect(element.childNodes).toHaveLength(0);
	});

	it('applies className and text', () => {
		const element = el('span', { className: 'fe-chip__count', text: '237' });

		expect(element.className).toBe('fe-chip__count');
		expect(element.textContent).toBe('237');
	});

	it('renders booleans as strings so ARIA states survive the trip', () => {
		// `aria-pressed="false"` and a MISSING `aria-pressed` mean different things to a screen
		// reader, so `false` must reach the DOM rather than being treated as "omit".
		const element = el('button', { attrs: { 'aria-pressed': false, type: 'button' }});

		expect(element.getAttribute('aria-pressed')).toBe('false');
		expect(element.getAttribute('type')).toBe('button');
	});

	it('omits null and undefined attributes entirely', () => {
		const element = el('a', { attrs: { download: null, href: '/books', target: undefined }});

		expect(element.getAttribute('href')).toBe('/books');
		expect(element.hasAttribute('download')).toBe(false);
		expect(element.hasAttribute('target')).toBe(false);
	});

	it('stringifies numeric attributes', () => {
		expect(el('img', { attrs: { height: 36, width: 36 }}).getAttribute('height')).toBe('36');
	});

	it('converts camelCase style keys to their CSS property names', () => {
		const element = el('div', { style: { animationDelay: '120ms' }});

		expect(element.style.getPropertyValue('animation-delay')).toBe('120ms');
	});

	it('passes custom properties through untouched — including a mixed-case one', () => {
		// 🔴 The capitals in the second name are the whole test, because the obvious version of it
		// SURVIVES its mutant. Both custom
		// properties this app actually passes — `--fe-loader-tempo` and `--fe-tree-max-height` —
		// are already kebab-case, so `key.replace(/[A-Z]/gu, …)` is a no-op on them: deleting the
		// `startsWith('--')` guard changes nothing an existing caller can observe, and a test using
		// only real names is green over its own removal.
		//
		// Custom properties are case-SENSITIVE, so `--feTempo` and `--fe-tempo` are different
		// properties and a helper that silently kebab-cases one into the other writes a declaration
		// no stylesheet reads. That is the contract the docblock states, and this is the only input
		// class that can see it.
		const element = el('div', { style: { '--fe-loader-tempo': '2s', '--feTempo': '400ms' }});

		expect(element.style.getPropertyValue('--fe-loader-tempo')).toBe('2s');
		expect(element.style.getPropertyValue('--feTempo')).toBe('400ms');
		expect(element.style.getPropertyValue('--fe-tempo')).toBe('');
	});

	it('wires event listeners', () => {
		let clickCount = 0;
		const element = el('button', {
			attrs: { type: 'button' },
			on: {
				click: () => {
					clickCount += 1;
				},
			},
		});

		element.click();

		expect(clickCount).toBe(1);
	});

	it('appends children in order, skipping falsy entries', () => {
		// The falsy entries are what make `cond && node` work at call sites without a ternary and a
		// filler node. All three falsy shapes are here because `children` is typed for all three.
		const element = el('p', { children: ['before ', false, null, undefined, el('code', { text: 'core' })]});

		expect(element.textContent).toBe('before core');
		expect(element.childNodes).toHaveLength(2);
	});
});

describe('append', () => {
	it('wraps strings as text nodes and skips every falsy child', () => {
		const parent = el('div');

		append(parent, ['a', false, null, undefined, el('b', { text: 'c' })]);

		expect(parent.childNodes).toHaveLength(2);
		expect(parent.firstChild?.nodeType).toBe(Node.TEXT_NODE);
		expect(parent.textContent).toBe('ac');
	});

	it('is a no-op for an empty list', () => {
		const parent = el('div', { text: 'kept' });

		append(parent, []);

		expect(parent.textContent).toBe('kept');
	});
});

describe('setHidden', () => {
	it('hides with an INLINE display and never touches the hidden attribute', () => {
		// Both halves are load-bearing, and neither is redundant with the other: the inline `display`
		// is the only thing that outranks an authored class rule, and the absent attribute is what
		// distinguishes this from the mutant. See the file remarks for why `getComputedStyle` cannot
		// stand in for either assertion under jsdom.
		const element = el('div', { className: 'fe-active-filters__empty' });

		setHidden(element, true);

		expect(element.style.display).toBe('none');
		expect(element.hasAttribute('hidden')).toBe(false);
	});

	it("restores the stylesheet's display rather than hard-coding one", () => {
		// Clearing to `''` (not `'block'` / `'flex'`) is why one helper serves every `fe-*` family:
		// the element goes back to whatever `ui-styles` says it is, which differs per block.
		const element = el('div');

		setHidden(element, true);
		setHidden(element, false);

		expect(element.style.display).toBe('');
		expect(element.hasAttribute('hidden')).toBe(false);
	});
});

describe('svg', () => {
	it('creates elements in the SVG namespace, which createElement cannot', () => {
		// The whole reason this helper exists: `document.createElement('circle')` yields an HTML
		// unknown element that renders nothing inside an `<svg>`.
		const element = svg('circle');

		expect(element.namespaceURI).toBe('http://www.w3.org/2000/svg');
		expect(element.tagName).toBe('circle');
	});

	it('stringifies numeric attributes and appends children in order', () => {
		const child = svg('path', { d: 'M3 5h18' });
		const element = svg('svg', { 'aria-hidden': 'true', height: 18, viewBox: '0 0 24 24' }, [child]);

		expect(element.getAttribute('height')).toBe('18');
		expect(element.getAttribute('aria-hidden')).toBe('true');
		expect(element.firstChild).toBe(child);
	});

	it('defaults to no attributes and no children', () => {
		const element = svg('g');

		expect(element.attributes).toHaveLength(0);
		expect(element.childNodes).toHaveLength(0);
	});
});
