/**
 * Tests for `escapeHtml.ts`.
 *
 * @remarks
 * Runs in the `node` project with the Worker's tests, so the round trip through a real parser lives
 * with the pages that parse its output (`compare/compareView.test.ts`, under jsdom); this pins the
 * substitutions themselves.
 *
 * @packageDocumentation
 */

import { describe, expect, it } from 'vitest';

import { escapeHtml } from './escapeHtml.js';

describe('escapeHtml', () => {
	it('escapes the five characters HTML gives meaning to', () => {
		expect(escapeHtml(`a < b && "c" > 'd'`)).toBe('a &lt; b &amp;&amp; &quot;c&quot; &gt; &#39;d&#39;');
	});

	it('escapes an ampersand once, not again inside the entities it writes', () => {
		expect(escapeHtml('<&>')).toBe('&lt;&amp;&gt;');
	});

	it('leaves text with nothing to escape unchanged', () => {
		expect(escapeHtml('Wine · SvelteKit (server)')).toBe('Wine · SvelteKit (server)');
	});
});
