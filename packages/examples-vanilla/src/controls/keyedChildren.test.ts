/**
 * The keyed part cache and the children reconciler every list-shaped control updates through.
 *
 * @packageDocumentation
 */

import { el } from '@filter-enginez/examples-shared/dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createKeyedParts, reconcileChildren, setOptionalAttribute } from './keyedChildren.js';

afterEach(() => {
	document.body.replaceChildren();
});

/**
 * A cache of `<button>`s keyed by text, counting how many it built.
 *
 * @returns The cache and the build spy.
 */
function buttonCache() {
	const create = vi.fn((key: string) => ({ element: el('button', { text: key }), key }));

	return { cache: createKeyedParts(create), create };
}

describe('createKeyedParts', () => {
	it('hands back the same part for a key on every resolve, and builds only new keys', () => {
		const { cache, create } = buttonCache();
		const [a] = cache.resolve(['a', 'b']);
		const [, again] = cache.resolve(['b', 'a', 'c']);

		expect(again).toBe(a);
		expect(create.mock.calls.map(([key]) => key)).toEqual(['a', 'b', 'c']);
	});

	it('forgets a key that stops being rendered, so it is built afresh on its return', () => {
		const { cache } = buttonCache();
		const [first] = cache.resolve(['a']);

		cache.resolve(['b']);

		const [returned] = cache.resolve(['a']);

		expect(returned).not.toBe(first);
	});

	it('builds everything afresh after a reset', () => {
		const { cache } = buttonCache();
		const [first] = cache.resolve(['a']);

		cache.reset();

		expect(cache.resolve(['a'])[0]).not.toBe(first);
	});
});

describe('reconcileChildren', () => {
	it('removes and inserts around the elements that stay, without detaching the focused one', () => {
		const parent = el('div');
		const [a, b, c, d] = ['a', 'b', 'c', 'd'].map((text) => el('button', { text }));

		if (a === undefined || b === undefined || c === undefined || d === undefined) {
			throw new Error('expected four buttons');
		}
		document.body.append(parent);
		parent.append(a, b, c);
		b.focus();

		const removeSpy = vi.spyOn(b, 'remove');

		// A branch opening (`d` after `a`) and a row going away (`c`): the shape a tree repaint takes.
		reconcileChildren(parent, [a, d, b]);

		expect([...parent.children].map((child) => child.textContent)).toEqual(['a', 'd', 'b']);
		expect(document.activeElement).toBe(b);
		expect(removeSpy).not.toHaveBeenCalled();
	});

	it('reorders when the order itself changes', () => {
		const parent = el('div');
		const [a, b, c] = ['a', 'b', 'c'].map((text) => el('span', { text }));

		if (a === undefined || b === undefined || c === undefined) {
			throw new Error('expected three spans');
		}
		parent.append(a, b, c);
		reconcileChildren(parent, [c, a, b]);

		expect([...parent.children]).toEqual([c, a, b]);
	});

	it('empties the parent for an empty list', () => {
		const parent = el('div', { children: [el('span'), el('span')]});

		reconcileChildren(parent, []);

		expect(parent.childElementCount).toBe(0);
	});
});

describe('setOptionalAttribute', () => {
	it('sets a value and removes the attribute for null', () => {
		const element = el('span');

		setOptionalAttribute(element, 'title', 'Why');
		expect(element.getAttribute('title')).toBe('Why');

		setOptionalAttribute(element, 'title', null);
		expect(element.hasAttribute('title')).toBe(false);
	});
});
