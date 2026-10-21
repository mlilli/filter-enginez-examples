/**
 * Tests for `<SectionHeader>` — the heading every panel section is found by.
 *
 * @remarks
 * The e2e parity cases address a section by its heading's exact text (`panelSection` in
 * `tests/e2e/parityProbes.ts`), read untrimmed as a browser locator reads it. The template compiler
 * keeps a space for a line break between an interpolation and the next element, so a heading spread
 * over several lines renders `Color ` and no section is found. These read `textContent` raw, never
 * through `text()`, which trims.
 */

import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import SectionHeader from './SectionHeader.vue';

describe('<SectionHeader>', () => {
	it('renders exactly the label, with no whitespace around it', () => {
		const heading = mount(SectionHeader, { props: { label: 'Color' }}).find('h3');

		expect(heading.element.textContent).toBe('Color');
		expect(heading.classes()).toContain('fe-filter-section-label');
	});

	it('puts a note on its own line, directly after the label', () => {
		const heading = mount(SectionHeader, { props: { label: 'Smart filters', note: '(expression mode)' }}).find('h3');

		expect(heading.element.textContent).toBe('Smart filters(expression mode)');
		expect(heading.find('br').exists()).toBe(true);
		expect(heading.find('.fe-filter-section-label__note').element.textContent).toBe('(expression mode)');
	});
});
