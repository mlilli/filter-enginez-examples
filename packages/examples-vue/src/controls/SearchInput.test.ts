/**
 * Tests for `<SearchInput>` — one `commit` per gesture.
 *
 * @remarks
 * Enter commits and then blurs the field, and the blur must not commit the same text a second time;
 * the clear button commits the empty query once. The parent's typeahead binding would swallow a
 * duplicate, but a control that emits one is a control every other parent has to defend against.
 */

import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';

import SearchInput from './SearchInput.vue';

/** Every wrapper a case mounted, unmounted after it. */
const mounted: VueWrapper[] = [];

afterEach(() => {
	for (const wrapper of mounted.splice(0)) {
		wrapper.unmount();
	}
});

/**
 * Mount the field, attached so focus and blur are real.
 *
 * @param value - The text the parent passes.
 * @returns The wrapper.
 */
function mountInput(value = '') {
	const wrapper = mount(SearchInput, { attachTo: document.body, props: { inputLabel: 'Search', value }});

	mounted.push(wrapper);

	return wrapper;
}

/**
 * The `commit` payloads emitted so far.
 *
 * @param wrapper - The field.
 * @returns Each committed text, oldest first.
 */
function commits(wrapper: ReturnType<typeof mountInput>): string[] {
	return (wrapper.emitted('commit') ?? []).map((args) => String(args[0]));
}

describe('<SearchInput>', () => {
	it('forwards each keystroke as a change, without committing', async () => {
		const wrapper = mountInput();
		const field = wrapper.find('input');

		await field.setValue('oak');

		expect(wrapper.emitted('change')).toEqual([['oak']]);
		expect(commits(wrapper)).toEqual([]);
	});

	it('commits once on Enter, not again on the blur Enter causes', async () => {
		const wrapper = mountInput('oak');
		const field = wrapper.find('input');

		(field.element as HTMLInputElement).focus();
		await field.trigger('keydown', { key: 'Enter' });

		expect(document.activeElement).not.toBe(field.element);
		expect(commits(wrapper)).toEqual(['oak']);
	});

	it('commits on a plain blur', async () => {
		const wrapper = mountInput('oak');

		await wrapper.find('input').trigger('blur');

		expect(commits(wrapper)).toEqual(['oak']);
	});

	it('commits the empty query once from the clear button', async () => {
		const wrapper = mountInput('oak');

		await wrapper.find('button[aria-label="Clear search"]').trigger('click');

		expect(commits(wrapper)).toEqual(['']);
		expect(wrapper.emitted('change')).toBeUndefined();
	});
});
