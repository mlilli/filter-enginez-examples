/**
 * Tests for `<CompareLinkButton>` — the header control that takes the current filter state to the
 * comparison page on the landing site.
 *
 * @remarks
 * Parity with the vanilla `createCompareLinkButton` suite. The enabled and disabled states differ by
 * ONE attribute, `aria-disabled`, and both the stylesheet and the e2e select on the exact value
 * `'true'`, so both states are asserted by value: a stray `"false"` on the enabled link would look
 * right in one channel and wrong in the other.
 *
 * The state is driven through `serializedFilterState`, the same ref the URL sync writes, because that
 * is the component's only source of truth.
 *
 * @packageDocumentation
 */

import { SITE } from '@filter-enginez/examples-shared/verticals';
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';

import CompareLinkButton from './CompareLinkButton.vue';
import { serializedFilterState } from './urlState.js';

/** A minimal, valid readable-format state. */
const SERIALIZED = 'h~{"version":1,"rules":[]}';

afterEach(() => {
	serializedFilterState.value = null;
});

describe('<CompareLinkButton>', () => {
	it('is inert, with no state, and refuses the navigation', () => {
		const wrapper = mount(CompareLinkButton, { props: { dataset: 'books' }});
		const link = wrapper.find('a');

		expect(link.attributes('aria-disabled')).toBe('true');

		const event = new MouseEvent('click', { bubbles: true, cancelable: true });

		link.element.dispatchEvent(event);

		expect(event.defaultPrevented, 'an inert Compare button still navigated').toBe(true);
	});

	it('drops the attribute entirely once there is state, and lets the navigation through', () => {
		serializedFilterState.value = SERIALIZED;

		const wrapper = mount(CompareLinkButton, { props: { dataset: 'books' }});
		const link = wrapper.find('a');

		expect(link.attributes('aria-disabled')).toBeUndefined();

		const event = new MouseEvent('click', { bubbles: true, cancelable: true });

		link.element.dispatchEvent(event);

		expect(event.defaultPrevented, 'a ready Compare button refused its own navigation').toBe(false);
	});

	it('opens the comparison page on the landing site, carrying the dataset and the state', () => {
		serializedFilterState.value = SERIALIZED;

		const wrapper = mount(CompareLinkButton, { props: { dataset: 'real-estate' }});
		const href = new URL(wrapper.find('a').attributes('href') ?? '');

		// jsdom serves from a loopback host, so this is the development layout: the local site server.
		expect(href.origin).toBe(SITE.devOrigin);
		expect(href.pathname).toBe('/compare');
		expect(href.searchParams.get('dataset')).toBe('real-estate');
		expect(href.searchParams.get('f')).toBe(SERIALIZED);
	});

	it('re-targets itself when the state changes, without being remounted', async () => {
		const wrapper = mount(CompareLinkButton, { props: { dataset: 'books' }});

		expect(new URL(wrapper.find('a').attributes('href') ?? '').searchParams.get('f')).toBeNull();

		serializedFilterState.value = SERIALIZED;
		await nextTick();

		expect(wrapper.find('a').attributes('aria-disabled')).toBeUndefined();
		expect(new URL(wrapper.find('a').attributes('href') ?? '').searchParams.get('f')).toBe(SERIALIZED);
	});
});
