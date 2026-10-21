/**
 * Tests for `<TimeTravelControls>` — every undo and redo marks the engine busy before it writes.
 *
 * @remarks
 * The buttons and the Cmd/Ctrl+Z shortcuts go through the same two handlers, so a keyboard undo
 * lights the computing indicator exactly as a click does, and a shortcut with nothing to undo writes
 * nothing and marks nothing.
 */

import { createFilterEngine, inSet } from '@filter-enginez/core';
import { createSignalsEngine, type SignalsEngine } from '@filter-enginez/reactive-signals';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import TimeTravelControls from './TimeTravelControls.vue';

/** A two-row engine; the cases only need something to undo. */
function bootEngine(): SignalsEngine<{ readonly id: string; readonly color: string }> {
	return createSignalsEngine(createFilterEngine({ sourceData: [{ color: 'red', id: 'a' }, { color: 'white', id: 'b' }]}));
}

/** Every wrapper mounted by a case, unmounted after it. */
const mounted: VueWrapper[] = [];

afterEach(() => {
	for (const wrapper of mounted.splice(0)) {
		wrapper.unmount();
	}
});

/**
 * Mount the controls over an engine.
 *
 * @param engine - The engine.
 * @returns The wrapper and the busy spy.
 */
function mountControls(engine: ReturnType<typeof bootEngine>) {
	const markBusy = vi.fn();
	const wrapper = mount(TimeTravelControls, { attachTo: document.body, props: { engine, isDevtoolsOpen: false, markBusy }});

	mounted.push(wrapper);

	return { markBusy, wrapper };
}

/**
 * Press Ctrl+Z (or Ctrl+Shift+Z) on the page, the way a real keyboard reports it.
 *
 * @param isRedo - Whether Shift is held.
 */
function pressUndoShortcut(isRedo = false): void {
	document.body.dispatchEvent(
		new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ctrlKey: true, key: isRedo ? 'Z' : 'z', shiftKey: isRedo }),
	);
}

describe('<TimeTravelControls>', () => {
	it('marks busy before a keyboard undo and a keyboard redo', async () => {
		const engine = bootEngine();
		const { markBusy } = mountControls(engine);

		engine.core.addRule('color', inSet<string>('color', ['red']));
		await flushPromises();

		pressUndoShortcut();
		expect(markBusy).toHaveBeenCalledOnce();
		expect(engine.core.getRules().has('color')).toBe(false);

		await flushPromises();
		pressUndoShortcut(true);
		expect(markBusy).toHaveBeenCalledTimes(2);
		expect(engine.core.getRules().has('color')).toBe(true);
	});

	it('writes nothing and marks nothing for a shortcut with nothing to undo', () => {
		const engine = bootEngine();
		const { markBusy } = mountControls(engine);

		pressUndoShortcut();

		expect(markBusy).not.toHaveBeenCalled();
	});

	it('marks busy before an undo button click', async () => {
		const engine = bootEngine();
		const { markBusy, wrapper } = mountControls(engine);

		engine.core.addRule('color', inSet<string>('color', ['red']));
		await flushPromises();
		await wrapper.find('button[aria-label="Undo (Cmd/Ctrl+Z)"]').trigger('click');

		expect(markBusy).toHaveBeenCalledOnce();
		expect(engine.core.getRules().has('color')).toBe(false);
	});
});
